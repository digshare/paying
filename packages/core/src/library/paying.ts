import type {
  AbstractTransaction,
  Action,
  ChangeRenewalInfoAction,
  ChangeRenewalStatusAction,
  IPayingService,
  IProduct,
  OriginalTransactionDocument,
  PayingServiceSubscriptionPrepareOptions,
  PaymentConfirmedAction,
  PurchaseCreation,
  PurchaseReceipt,
  PurchaseTransactionDocument,
  RechargeFailed,
  SubscribedAction,
  Subscription,
  SubscriptionCanceledAction,
  SubscriptionReceipt,
  SubscriptionRenewalAction,
  SubscriptionTransactionDocument,
  Timestamp,
  TransactionDocument,
  TransactionId,
  User,
  UserId,
} from './definitions';
import {SubscriptionTransaction} from './definitions';
import type {RepositoryConfig} from './repository';
import {Repository} from './repository';

interface PayingConfig {
  repository: RepositoryConfig;
  purchaseExpiresAfter: number;
  renewalBefore: number;
}

type InferProduct<TPayingService extends IPayingService> =
  TPayingService['products'][number];

type ActionToHandler<TServiceKey extends string> = {
  [TType in Action['type']]: (
    serviceName: TServiceKey,
    action: Extract<Action, {type: TType}>,
  ) => Promise<void>;
};

interface PrepareSubscriptionOptions<TProduct extends IProduct> {
  product: TProduct;
  userId: UserId;
}

export class Paying<
  TPayingService extends IPayingService,
  TServiceKey extends string,
> {
  ready: Promise<void>;

  private actionHandler: ActionToHandler<TServiceKey> = {
    subscribed: this.handleSubscribed.bind(this),
    'payment-confirmed': this.handlePaymentConfirmed.bind(this),
    'change-renewal-info': this.handleChangeRenewalInfo.bind(this),
    'change-renewal-status': this.handleChangeRenewalStatus.bind(this),
    'subscription-renewal': this.handleRenewal.bind(this),
    'subscription-canceled': this.handleSubscriptionCanceled.bind(this),
    'recharge-failed': this.rechargeFailed.bind(this),
  };

  constructor(
    readonly services: Record<TServiceKey, IPayingService>,
    public config: PayingConfig,
    private repository: Repository = new Repository(config.repository),
  ) {
    this.ready = this.repository.ready;
  }

  async user(id: UserId): Promise<User> {
    return this.repository.getUserById(id);
  }

  async prepareSubscription(
    serviceName: TServiceKey,
    options: PrepareSubscriptionOptions<InferProduct<TPayingService>>,
  ): Promise<{subscription: Subscription; response: unknown}> {
    let {product, userId} = options;

    let activeSubscription: Subscription | undefined;

    if (product.group) {
      activeSubscription =
        await this.repository.getActiveSubscriptionTransactionsByUserIdInGroup(
          userId,
          product.group,
        );
    }

    if (activeSubscription) {
      await this.cancelSubscription(serviceName, activeSubscription);
    }

    return this.createSubscription(serviceName, options, activeSubscription);
  }

  async getTransaction(
    serviceName: TServiceKey,
    id: TransactionId,
  ): Promise<AbstractTransaction | undefined> {
    let doc = await this.repository.getTransactionById(serviceName, id);

    return doc && this.repository.buildTransactionFromDoc(doc);
  }

  async preparePurchase(
    serviceName: TServiceKey,
    product: InferProduct<TPayingService>,
    userId: UserId,
  ): Promise<any> {
    let service = this.requireService(serviceName);

    let now = new Date().getTime() as Timestamp;

    let paymentExpiresAt = (now +
      this.config.purchaseExpiresAfter) as Timestamp;

    let purchaseCreation: PurchaseCreation = {
      product,
      paymentExpiresAt,
      userId,
    };

    let {response, transactionId} = await service.preparePurchaseData(
      purchaseCreation,
    );

    let transactionDoc: PurchaseTransactionDocument = {
      _id: transactionId,
      product: product.id,
      productGroup: product.group,
      user: userId,
      createdAt: now,
      purchasedAt: undefined,
      completedAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      paymentExpiresAt,
      failedAt: undefined,
      service: serviceName,
      type: 'purchase',
      raw: undefined,
    };

    await this.repository.createTransaction(transactionDoc);

    return response;
  }

  async handleCallback(serviceName: TServiceKey, data: unknown): Promise<void> {
    let service = this.requireService(serviceName);

    let action = await service.parseCallback(data);

    if (!action) {
      return;
    }

    await this.applyAction(serviceName, action);
  }

  async handleReceipt(
    serviceName: TServiceKey,
    userId: UserId,
    receipt: unknown,
  ): Promise<void> {
    let service = this.requireService(serviceName);

    let result = await service.parseReceipt(receipt);

    if (result.subscription) {
      let subscription = result.subscription;

      await this.syncSubscription(serviceName, userId, subscription);
    }

    if (result.purchase.length > 0) {
      for (const purchase of result.purchase) {
        await this.syncTransaction(serviceName, userId, purchase);
      }
    }
  }

  async cancelSubscription(
    serviceName: TServiceKey,
    subscription: Subscription,
  ): Promise<void> {
    let service = this.requireService(serviceName);
    let canceled = await service.cancelSubscription({subscription});

    if (canceled) {
      await this.handleSubscriptionCanceled(serviceName, {
        type: 'subscription-canceled',
        originalTransactionId: subscription.id,
        canceledAt: Date.now() as Timestamp,
      });
    }

    await subscription.refresh();

    if (subscription.status !== 'canceled') {
      throw new Error('Subscription cancellation failed.');
    }
  }

  async checkTransactions(
    serviceName: TServiceKey,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    let pendingTransactions = this.repository
      .collectionOfType('transaction')
      .find({
        completedAt: {$exists: false},
        canceledAt: {$exists: false},
        purchasedAt: {$exists: false},
        service: serviceName,
      });

    while (await pendingTransactions.hasNext()) {
      let transaction = (await pendingTransactions.next())!;

      try {
        await this.checkTransaction(
          serviceName,
          this.repository.buildTransactionFromDoc(transaction),
        );
      } catch (error) {
        onError?.(error);
      }
    }
  }

  // async checkSubscriptions(
  //   serviceName: TServiceKey,
  //   breakPolicy: 'onError' | 'never',
  // ): Promise<void> {
  //   await this.checkSubscriptionRenewal(serviceName);
  // }

  async checkUncompletedSubscription(
    serviceName: TServiceKey,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    let service = this.requireService(serviceName);

    let uncompletedSubscriptions = this.repository
      .collectionOfType('original-transaction')
      .find({
        subscribedAt: {$exists: false},
        canceledAt: {$exists: false},
        service: serviceName,
      });

    while (await uncompletedSubscriptions.hasNext()) {
      const originalTransactionDoc = (await uncompletedSubscriptions.next())!;

      try {
        let result = await service.querySubscriptionStatus(
          originalTransactionDoc._id,
        );

        if (result.type === 'canceled') {
          await this.handleSubscriptionCanceled(serviceName, {
            type: 'subscription-canceled',
            originalTransactionId: originalTransactionDoc._id,
            canceledAt: result.canceledAt,
          });
        } else if (result.type === 'subscribed') {
          await this.handleSubscribed(serviceName, {
            type: 'subscribed',
            originalTransactionId: originalTransactionDoc._id,
            subscribedAt: result.subscribedAt,
          });
        }
        // TODO: record request failed reason
      } catch (error) {
        onError?.(error);
      }
    }
  }

  async checkSubscriptionRenewal(
    serviceName: TServiceKey,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    let service = this.requireService(serviceName);
    let adventDate = (Date.now() + this.config.renewalBefore) as Timestamp;

    let originalTransactions = this.repository
      .collectionOfType('original-transaction')
      .find({
        expiresAt: {$lt: adventDate},
        canceledAt: {$exists: false},
        subscribedAt: {$exists: true},
        service: serviceName,
      });

    while (await originalTransactions.hasNext()) {
      try {
        let originalTransaction = (await originalTransactions.next())!;

        let action = await service.rechargeSubscription(
          originalTransaction,
          (Date.now() + this.config.purchaseExpiresAfter) as Timestamp,
        );

        if (action) {
          await this.applyAction(serviceName, action);
        }
      } catch (error) {
        onError?.(error);
      }
    }
  }

  private async applyAction(
    serviceName: TServiceKey,
    action: Action,
  ): Promise<void> {
    // TODO: type safe
    return this.actionHandler[action.type](serviceName, action as any);
  }

  private async rechargeFailed(
    _serviceName: TServiceKey,
    action: RechargeFailed,
  ): Promise<void> {
    // TODO: record reason?

    await this.repository.collectionOfType('original-transaction').updateOne(
      {
        _id: action.originalTransactionId,
      },
      {
        $set: {
          lastFailedReason: action.reason,
          lastFailedAt: action.failedAt,
        },
      },
    );

    return;
  }

  private async handleSubscriptionCanceled(
    _serviceName: TServiceKey,
    action: SubscriptionCanceledAction,
  ): Promise<void> {
    await this.repository.collectionOfType('original-transaction').updateOne(
      {
        _id: action.originalTransactionId,
      },
      {
        $set: {
          canceledAt: action.canceledAt,
          renewalEnabled: false,
        },
      },
    );
  }

  private async checkTransaction(
    serviceName: TServiceKey,
    transaction: AbstractTransaction,
  ): Promise<void> {
    let service = this.requireService(serviceName);

    if (transaction.status === 'pending') {
      let status = await service.queryTransactionStatus(transaction.id);

      if (status.type === 'success') {
        await this.handlePaymentConfirmed(serviceName, {
          type: 'payment-confirmed',
          transactionId: transaction.id,
          purchasedAt: status.purchasedAt,
        });
      } else if (status.type === 'canceled') {
        await this.cancelTransaction(
          serviceName,
          transaction,
          status.canceledAt,
        );
      }
      // TODO: record request failed reason
    }
  }

  private async cancelTransaction(
    serviceName: TServiceKey,
    transaction: AbstractTransaction,
    canceledAt: Timestamp,
    reason?: any,
  ): Promise<void> {
    if (
      transaction instanceof SubscriptionTransaction &&
      transaction.originalTransactionId
    ) {
      // TODO: original transaction 要不要一起取消
      // await this.repository.collectionOfType('original-transaction').updateOne()
    }

    await this.repository.collectionOfType('transaction').updateOne(
      {
        _id: transaction.id,
        service: serviceName,
      },
      {
        $set: {
          canceledAt,
          cancelReason: reason,
        },
      },
    );
  }

  private async handleSubscribed(
    serviceName: TServiceKey,
    data: SubscribedAction,
  ): Promise<void> {
    let {subscribedAt, originalTransactionId, autoRenewalEnabled = true} = data;

    let originalTransaction = await this.repository.getOriginalTransactionById(
      serviceName,
      originalTransactionId,
    );

    if (!originalTransaction) {
      throw new Error(
        `Original transaction ${originalTransactionId} for service [${serviceName}] not found`,
      );
    }

    await this.repository.collectionOfType('original-transaction').updateOne(
      {_id: originalTransactionId, service: serviceName},
      {
        $set: {
          subscribedAt,
          serviceExtra: data.extra,
          renewalEnabled: autoRenewalEnabled,
        },
      },
    );
  }

  private async handlePaymentConfirmed(
    serviceName: TServiceKey,
    data: PaymentConfirmedAction,
  ): Promise<void> {
    let now = new Date().getTime() as Timestamp;

    let {transactionId, purchasedAt} = data;

    let transactionDoc = await this.repository.getTransactionById(
      serviceName,
      transactionId,
    );

    if (!transactionDoc) {
      throw new Error(
        `Transaction ${transactionId} for service [${serviceName}] not found`,
      );
    }

    if (transactionDoc.completedAt) {
      throw new Error(
        `Transaction ${transactionDoc._id} has already been completed.`,
      );
    }

    await this.repository.collectionOfType('transaction').updateOne(
      {
        _id: transactionId,
      },
      {
        $set: {
          completedAt: now,
          purchasedAt,
        },
        $unset: {
          paymentExpiresAt: true,
        },
      },
    );

    if (transactionDoc.type !== 'subscription') {
      return;
    }

    let originalTransactionDoc =
      await this.repository.getOriginalTransactionById(
        serviceName,
        transactionDoc.originalTransactionId,
      );

    if (!originalTransactionDoc) {
      throw new Error(
        `Original transaction ${transactionDoc.originalTransactionId} for service [${serviceName}] not found`,
      );
    }

    let startsAt = originalTransactionDoc.startsAt ?? transactionDoc.startsAt;

    let nextStartsAt = transactionDoc.startsAt;

    // TODO: 续费
    // 当有赠送时，支付宝是否要延迟续费
    let expiresAt = (transactionDoc.duration + nextStartsAt) as Timestamp;

    if (expiresAt < (originalTransactionDoc.expiresAt ?? 0)) {
      throw new Error(
        `Incoming expiresAt ${expiresAt} should be later than current ${originalTransactionDoc.expiresAt}`,
      );
    }

    await this.repository.collectionOfType('original-transaction').updateOne(
      {
        _id: transactionDoc.originalTransactionId,
      },
      {
        $set: {
          startsAt,
          expiresAt,
        },
      },
    );
  }

  private async handleChangeRenewalInfo(
    serviceName: TServiceKey,
    renewalInfo: ChangeRenewalInfoAction,
  ): Promise<void> {
    let {originalTransactionId, productId, renewalEnabled, autoRenewProductId} =
      renewalInfo;

    await this.repository.collectionOfType('original-transaction').updateOne(
      {_id: originalTransactionId, service: serviceName},
      {
        $set: {
          product: productId,
          renewalProduct: autoRenewProductId,
          renewalEnabled,
        },
      },
    );
  }

  private async handleChangeRenewalStatus(
    serviceName: TServiceKey,
    renewalInfo: ChangeRenewalStatusAction,
  ): Promise<void> {
    let {originalTransactionId, renewalEnabled} = renewalInfo;

    await this.repository.collectionOfType('original-transaction').updateOne(
      {_id: originalTransactionId, service: serviceName},
      {
        $set: {
          renewalEnabled,
        },
      },
    );
  }

  private async handleRenewal(
    serviceName: TServiceKey,
    info: SubscriptionRenewalAction,
  ): Promise<void> {
    let now = Date.now() as Timestamp;
    let {transactionId, originalTransactionId, product, purchasedAt, duration} =
      info;

    let originalTransaction = await this.repository.requireOriginalTransaction(
      serviceName,
      originalTransactionId,
    );

    let nextStartsAt = Math.max(
      originalTransaction.expiresAt ?? 0,
      Date.now(),
    ) as Timestamp;
    let transaction = await this.repository.getTransactionById(
      serviceName,
      transactionId,
    );

    if (!transaction) {
      let transaction: TransactionDocument = {
        _id: transactionId,
        service: serviceName,
        type: 'subscription',
        product: product.id,
        paymentExpiresAt: undefined,
        purchasedAt,
        originalTransactionId,
        startsAt: nextStartsAt,
        completedAt: undefined,
        productGroup: product.group,
        canceledAt: undefined,
        createdAt: now,
        cancelReason: undefined,
        user: originalTransaction.user,
        // TODO: 确认一下，支付宝可能要 28内 才能续费
        duration,
        failedAt: undefined,
        // TODO: save raw info from apple
        raw: undefined,
      };

      await this.repository
        .collectionOfType('transaction')
        .insertOne(transaction);
    }

    await this.handlePaymentConfirmed(serviceName, {
      type: 'payment-confirmed',
      transactionId,
      purchasedAt,
    });
  }

  private requireService(serviceName: TServiceKey): IPayingService {
    const service = this.services[serviceName];

    if (!service) {
      throw new Error(`Unknown PayingService ${JSON.stringify(serviceName)}`);
    }

    return service;
  }

  private async syncTransaction(
    serviceName: TServiceKey,
    userId: UserId,
    {
      product,
      transactionId,
      purchasedAt,
    }: PurchaseReceipt<InferProduct<TPayingService>>,
  ): Promise<void> {
    let now = Date.now() as Timestamp;

    let transaction = await this.repository.getTransactionById(
      serviceName,
      transactionId,
    );

    if (transaction) {
      return;
    }

    let transactionDoc: TransactionDocument = {
      _id: transactionId,
      service: serviceName,
      type: 'purchase',
      paymentExpiresAt: undefined,
      purchasedAt,
      product: product.id,
      productGroup: product.group,
      cancelReason: undefined,
      canceledAt: undefined,
      createdAt: now,
      completedAt: purchasedAt,
      user: userId,
      failedAt: undefined,
      raw: undefined,
    };

    await this.repository.createTransaction(transactionDoc);
  }

  private async syncSubscription(
    serviceName: TServiceKey,
    userId: UserId,
    {
      originalTransactionId,
      transactionId,
      purchasedAt,
      expiresAt,
      subscribedAt,
      product,
      autoRenewal,
      autoRenewalProduct,
    }: SubscriptionReceipt<InferProduct<TPayingService>>,
  ): Promise<void> {
    let now = Date.now() as Timestamp;
    let startsAt = purchasedAt;
    let lastOriginalTransaction =
      await this.repository.getOriginalTransactionById(
        serviceName,
        originalTransactionId,
      );
    let lastTransaction = await this.repository.getTransactionById(
      serviceName,
      transactionId,
    );

    if (lastOriginalTransaction) {
      await this.repository.collectionOfType('original-transaction').updateOne(
        {_id: originalTransactionId},
        {
          $set: {
            product: product.id,
            renewalProduct: autoRenewalProduct?.id,
            productGroup: product.group,
            expiresAt,
            subscribedAt,
            renewalEnabled: autoRenewal,
            user: userId,
            service: serviceName,
          },
        },
      );
    } else {
      let originalTransactionDoc: OriginalTransactionDocument = {
        _id: originalTransactionId,
        // TODO: thirdPartyId for alipay
        product: product.id,
        renewalProduct: autoRenewalProduct?.id,
        productGroup: product.group,
        startsAt: undefined,
        createdAt: now,
        expiresAt,
        subscribedAt,
        canceledAt: undefined,
        cancelReason: undefined,
        renewalEnabled: autoRenewal,
        lastFailedReason: undefined,
        user: userId,
        service: serviceName,
        serviceExtra: undefined,
      };

      await this.repository.createOriginalTransaction(originalTransactionDoc);
    }

    if (lastTransaction) {
      await this.repository.collectionOfType('transaction').updateOne(
        {_id: transactionId},
        {
          $set: {
            originalTransactionId,
            startsAt,
            duration: expiresAt - startsAt,
            product: product.id,
            productGroup: product.group,
            user: userId,
            purchasedAt,
            completedAt: purchasedAt,
            service: serviceName,
          },
        },
      );
    } else {
      let transactionDoc: SubscriptionTransactionDocument = {
        _id: transactionId,
        originalTransactionId,
        startsAt,
        duration: expiresAt - startsAt,
        product: product.id,
        productGroup: product.group,
        user: userId,
        createdAt: now,
        purchasedAt,
        completedAt: purchasedAt,
        canceledAt: undefined,
        cancelReason: undefined,
        paymentExpiresAt: undefined,
        failedAt: undefined,
        service: serviceName,
        type: 'subscription',
        raw: undefined,
      };

      await this.repository.createTransaction(transactionDoc);
    }
  }

  private async createSubscription(
    serviceName: TServiceKey,
    {product, userId}: PrepareSubscriptionOptions<InferProduct<TPayingService>>,
    lastSubscription?: Subscription,
  ): Promise<{
    subscription: Subscription;
    response: unknown;
  }> {
    let service = this.requireService(serviceName);
    let now = new Date().getTime() as Timestamp;

    let startsAt = Math.max(now, lastSubscription?.expiresAt ?? 0) as Timestamp;

    let subscriptionCreation: PayingServiceSubscriptionPrepareOptions = {
      startsAt,
      paymentExpiresAt: (now + this.config.purchaseExpiresAfter) as Timestamp,
      product,
      userId,
    };

    // TODO: 支付宝的取整逻辑可能要在这里覆盖原有 duration
    let {response, duration, originalTransactionId, transactionId} =
      await service.prepareSubscriptionData(subscriptionCreation);

    let originalTransactionDoc: OriginalTransactionDocument = {
      _id: originalTransactionId,
      // TODO: thirdPartyId for alipay
      product: product.id,
      renewalProduct: product.id,
      productGroup: product.group,
      startsAt: undefined,
      createdAt: now,
      expiresAt: undefined,
      subscribedAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      renewalEnabled: false,
      lastFailedReason: undefined,
      user: userId,
      service: serviceName,
      serviceExtra: undefined,
    };

    let transactionDoc: SubscriptionTransactionDocument = {
      _id: transactionId,
      originalTransactionId,
      startsAt,
      duration,
      product: product.id,
      productGroup: product.group,
      user: userId,
      createdAt: now,
      purchasedAt: undefined,
      completedAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      paymentExpiresAt: undefined,
      failedAt: undefined,
      service: serviceName,
      type: 'subscription',
      raw: undefined,
    };

    await this.repository.createOriginalTransaction(originalTransactionDoc);
    await this.repository.createTransaction(transactionDoc);

    let subscription = (await this.repository.getSubscriptionById(
      serviceName,
      originalTransactionId,
    ))!;

    return {subscription, response};
  }
}
