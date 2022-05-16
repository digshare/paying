import type {RepositoryConfig} from './@repository';
import {Repository} from './@repository';
import type {
  Action,
  ChangeRenewalInfoAction,
  ChangeRenewalStatusAction,
  IPayingService,
  OriginalTransactionDocument,
  PayingServiceSubscriptionPrepareOptions,
  PaymentConfirmedAction,
  PurchaseCreation,
  PurchaseTransactionDocument,
  RechargeFailed,
  SubscribedAction,
  Subscription,
  SubscriptionCanceledAction,
  SubscriptionRenewalAction,
  SubscriptionTransactionDocument,
  Timestamp,
  UserId,
} from './definitions';
import {Transaction} from './definitions';

interface PayingConfig {
  repository: RepositoryConfig;
  purchaseExpiresAfter: number;
  renewalBefore: number;
}

type InferProduct<TPayingService extends IPayingService> =
  TPayingService['__productType'];

type ActionToHandler = {
  [TType in Action['type']]: (
    serviceName: string,
    action: Extract<Action, {type: TType}>,
  ) => Promise<void>;
};

export class Paying<TPayingService extends IPayingService> {
  private repository: Repository;
  private actionHandler: ActionToHandler = {
    subscribed: this.handleSubscribed,
    'payment-confirmed': this.handlePaymentConfirmed,
    'change-renewal-info': this.handleChangeRenewalInfo,
    'change-renewal-status': this.handleChangeRenewalStatus,
    'subscription-renewal': this.handleRenewal,
    'subscription-canceled': this.handleSubscriptionCanceled,
    'recharge-failed': this.rechargeFailed,
  };

  constructor(
    readonly services: Record<string, IPayingService>,
    public config: PayingConfig,
  ) {
    this.repository = new Repository(config.repository);
  }

  async prepareSubscription(
    serviceName: string,
    product: InferProduct<TPayingService>,
    userId: UserId,
  ): Promise<any> {
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

    return this.createSubscription(serviceName, product, userId);
  }

  async preparePurchase(
    serviceName: string,
    product: InferProduct<TPayingService>,
    userId: UserId,
  ): Promise<any> {
    let service = this.requireService(serviceName);

    let now = new Date().getTime() as Timestamp;

    let transactionId = service.generateTransactionId();
    let paymentExpiresAt = (now +
      this.config.purchaseExpiresAfter) as Timestamp;

    let purchaseCreation: PurchaseCreation = {
      transactionId,
      product,
      paymentExpiresAt,
      userId,
    };

    let result = await service.preparePurchaseData(purchaseCreation);

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

    return result;
  }

  async handleCallback(serviceName: string, data: unknown): Promise<void> {
    let service = this.requireService(serviceName);

    let action = await service.parseCallback(data);

    if (!action) {
      return;
    }

    await this.applyAction(serviceName, action);
  }

  async handleReceipt(
    serviceName: string,
    userId: UserId,
    receipt: unknown,
  ): Promise<void> {
    let service = this.requireService(serviceName);

    let result = await service.parseReceipt(receipt);

    if (result.purchase.length > 0) {
      for (const purchase of result.purchase) {
        await this.preparePurchase(serviceName, purchase.product, userId);

        await this.handlePaymentConfirmed(serviceName, {
          type: 'payment-confirmed',
          transactionId: purchase.transactionId,
          purchasedAt: purchase.purchasedAt,
        });
      }
    }

    if (result.subscription) {
      let subscription = result.subscription;

      await this.prepareSubscription(serviceName, subscription.product, userId);
      await this.handleSubscribed(serviceName, {
        type: 'subscribed',
        originalTransactionId: subscription.originalTransactionId,
        subscribedAt: subscription.subscribedAt,
      });

      await this.handlePaymentConfirmed(serviceName, {
        type: 'payment-confirmed',
        transactionId: subscription.transactionId,
        purchasedAt: subscription.purchasedAt,
      });
    }
  }

  async cancelSubscription(
    serviceName: string,
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
    serviceName: string,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    let pendingTransactions = await this.repository
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
        await this.checkTransaction(serviceName, new Transaction(transaction));
      } catch (error) {
        onError?.(error);
      }
    }
  }

  // async checkSubscriptions(
  //   serviceName: string,
  //   breakPolicy: 'onError' | 'never',
  // ): Promise<void> {
  //   await this.checkSubscriptionRenewal(serviceName);
  // }

  async checkUncompletedSubscription(
    serviceName: string,
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
    serviceName: string,
    onError?: (error: unknown) => void,
  ): Promise<void> {
    let service = this.requireService(serviceName);
    let adventDate = (Date.now() +
      this.config.purchaseExpiresAfter) as Timestamp;

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
    serviceName: string,
    action: Action,
  ): Promise<void> {
    // TODO: type safe
    return this.actionHandler[action.type](serviceName, action as any);
  }

  private async rechargeFailed(
    _serviceName: string,
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
    _serviceName: string,
    action: SubscriptionCanceledAction,
  ): Promise<void> {
    await this.repository.collectionOfType('original-transaction').updateOne(
      {
        _id: action.originalTransactionId,
      },
      {
        $set: {
          canceledAt: action.canceledAt,
        },
      },
    );
  }

  private async checkTransaction(
    serviceName: string,
    transaction: Transaction,
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
    serviceName: string,
    transaction: Transaction,
    canceledAt: Timestamp,
    reason?: any,
  ): Promise<void> {
    if (transaction.originalTransactionId) {
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
    serviceName: string,
    data: SubscribedAction,
  ): Promise<void> {
    let {subscribedAt, originalTransactionId} = data;

    let originalTransaction = await this.repository.getOriginalTransactionById(
      serviceName,
      originalTransactionId,
    );

    if (!originalTransaction) {
      throw new Error(
        `Original transaction ${originalTransactionId} for service [${serviceName}] not found`,
      );
    }

    await this.repository
      .collectionOfType('original-transaction')
      .updateOne(
        {_id: originalTransactionId, service: serviceName},
        {$set: {subscribedAt, serviceExtra: data.extra}},
      );
  }

  private async handlePaymentConfirmed(
    serviceName: string,
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

    let lastExpiresAt =
      originalTransactionDoc.expiresAt ?? transactionDoc.startsAt;
    // TODO: 续费
    // 当有赠送时，支付宝是否要延迟续费
    let expiresAt = (transactionDoc.duration + lastExpiresAt) as Timestamp;

    await this.repository.collectionOfType('original-transaction').updateOne(
      {
        _id: transactionDoc.originalTransactionId,
      },
      {
        $set: {
          expiresAt,
        },
      },
    );
  }

  private async handleChangeRenewalInfo(
    serviceName: string,
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
    serviceName: string,
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
    serviceName: string,
    info: SubscriptionRenewalAction,
  ): Promise<void> {
    let {
      transactionId,
      originalTransactionId,
      product,
      purchasedAt,
      expiresAt,
      startsAt,
    } = info;

    let transaction = await this.repository.getTransactionById(
      serviceName,
      transactionId,
    );

    if (transaction) {
      if (transaction.type !== 'subscription') {
        throw new Error(`Transaction ${transactionId} is not a subscription.`);
      }

      await this.repository.collectionOfType('transaction').updateOne(
        {
          _id: transactionId,
          type: 'subscription',
        },
        {
          $set: {
            product: product.id,
            purchasedAt,
            startsAt,
            // TODO: 确认一下
            duration: expiresAt - startsAt,
          },
        },
      );
    } else {
      let originalTransaction =
        await this.repository.getOriginalTransactionById(
          serviceName,
          originalTransactionId,
        );

      if (!originalTransaction) {
        throw new Error(
          `Original transaction ${originalTransactionId} for service [${serviceName}] not found`,
        );
      }

      await this.repository.collectionOfType('transaction').insertOne({
        _id: transactionId,
        service: serviceName,
        type: 'subscription',
        product: product.id,
        paymentExpiresAt: undefined,
        purchasedAt,
        originalTransactionId,
        startsAt,
        completedAt: purchasedAt,
        productGroup: product.group,
        canceledAt: undefined,
        createdAt: purchasedAt,
        cancelReason: undefined,
        user: originalTransaction.user,
        // TODO: 确认一下
        duration: expiresAt - startsAt,
        failedAt: undefined,
        // TODO: save raw info from apple
        raw: undefined,
      });
    }
  }

  private requireService(serviceName: string): IPayingService {
    const service = this.services[serviceName];

    if (!service) {
      throw new Error(`Unknown PayingService ${JSON.stringify(serviceName)}`);
    }

    return service;
  }

  private async createSubscription(
    serviceName: string,
    product: InferProduct<TPayingService>,
    userId: UserId,
  ): Promise<{
    subscription: Subscription;
    // TODO: rename payload
    response: Awaited<ReturnType<TPayingService['prepareSubscriptionData']>>;
  }> {
    let service = this.requireService(serviceName);
    let now = new Date().getTime() as Timestamp;

    let originalTransactionId = service.generateOriginalTransactionId();
    let transactionId = service.generateTransactionId();

    let startsAt = now;

    let subscriptionCreation: PayingServiceSubscriptionPrepareOptions = {
      originalTransactionId,
      transactionId,
      startsAt,
      signedAt: undefined,
      renewalEnabled: false,
      paymentExpiresAt: (now + this.config.purchaseExpiresAfter) as Timestamp,
      product,
      userId,
      canceledAt: undefined,
    };

    // TODO: 支付宝的取整逻辑可能要在这里覆盖原有 duration
    let {response, duration} = await service.prepareSubscriptionData(
      subscriptionCreation,
    );

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

    return {subscription, response: response as any};
  }
}
