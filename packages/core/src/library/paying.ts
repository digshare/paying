import type {RepositoryConfig} from './@repository';
import {Repository} from './@repository';
import type {
  IPayingService,
  OriginalTransactionDocument,
  PayingServiceSubscriptionPrepareOptions,
  PaymentAction,
  PreparePurchaseOptions,
  PrepareSubscriptionOptions,
  PurchaseCreation,
  PurchaseTransactionDocument,
  SubscribedAction,
  Subscription,
  SubscriptionTransactionDocument,
  Timestamp,
} from './definitions';

interface PayingConfig {
  repository: RepositoryConfig;
  purchaseExpiresAfter: number;
}

type InferProduct<TPayingService extends IPayingService> =
  TPayingService['__productType'];

export class Paying<TPayingService extends IPayingService> {
  private repository: Repository;

  constructor(
    readonly services: Record<string, IPayingService>,
    public config: PayingConfig,
  ) {
    this.repository = new Repository(config.repository);
  }

  async prepareSubscription(
    serviceName: string,
    options: PrepareSubscriptionOptions<InferProduct<TPayingService>>,
  ): Promise<any> {
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

    return this.createSubscription(serviceName, options);
  }

  async preparePurchase(
    serviceName: string,
    options: PreparePurchaseOptions<InferProduct<TPayingService>>,
  ): Promise<any> {
    let {product, userId} = options;

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

    let result = await service.parseCallback(data);

    switch (result.type) {
      case 'subscribed':
        return this.handleSubscribed(serviceName, result);
      case 'payment':
        return this.handlePayment(serviceName, result);
    }
  }

  async handleReceipt(serviceName: string, receipt: unknown): Promise<void> {
    let service = this.requireService(serviceName);

    let result = await service.parseReceipt(receipt);

    switch (result.type) {
      case 'subscription':
        let {
          prepare: prepareSubscription,
          submit: {subscribed, payment},
        } = result;
        await this.prepareSubscription(serviceName, prepareSubscription);
        await this.handleSubscribed(serviceName, subscribed);
        await this.handlePayment(serviceName, payment);

        break;
      case 'purchase':
        let {prepare: preparePurchase, submit} = result;

        await this.preparePurchase(serviceName, preparePurchase);
        await this.handlePayment(serviceName, submit);

        break;
    }
  }

  async cancelSubscription(
    serviceName: string,
    subscription: Subscription,
  ): Promise<void> {
    let service = this.requireService(serviceName);
    let canceled = await service.cancelSubscription({subscription});

    if (canceled) {
      await this.repository.collectionOfType('original-transaction').updateOne(
        {
          _id: subscription.originalTransaction._id,
        },
        {
          $set: {
            canceledAt: new Date().getTime() as Timestamp,
          },
        },
      );
    }

    await subscription.refresh();

    if (subscription.status !== 'canceled') {
      throw new Error('Subscription cancellation failed.');
    }
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
        {$set: {subscribedAt, raw: data}},
      );
  }

  private async handlePayment(
    serviceName: string,
    data: PaymentAction,
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
          raw: data,
        },
        $unset: {
          paymentExpiresAt: true,
        },
      },
    );

    if (transactionDoc.type !== 'subscription') {
      return;
    }

    let startsAt = transactionDoc.startsAt;
    // TODO: 续费
    let expiresAt = (transactionDoc.duration + startsAt) as Timestamp;

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

  private requireService(serviceName: string): IPayingService {
    const service = this.services[serviceName];

    if (!service) {
      throw new Error(`Unknown PayingService ${JSON.stringify(serviceName)}`);
    }

    return service;
  }

  private async createSubscription(
    serviceName: string,
    {product, userId}: PrepareSubscriptionOptions<InferProduct<TPayingService>>,
  ): Promise<{
    subscription: Subscription;
    // TODO: rename payload
    response: Awaited<ReturnType<TPayingService['prepareSubscriptionData']>>;
  }> {
    let service = this.requireService(serviceName);
    let now = new Date().getTime() as Timestamp;

    let originalTransactionId = service.generateOriginalTransactionId();
    let transactionId = service.generateTransactionId();
    let duration = service.getDuration(product);

    let startsAt = now;
    let expiresAt = (now + duration) as Timestamp;

    let subscriptionCreation: PayingServiceSubscriptionPrepareOptions = {
      originalTransactionId,
      transactionId,
      startsAt,
      expiresAt,
      signedAt: undefined,
      renewalEnabled: false,
      paymentExpiresAt: (now + this.config.purchaseExpiresAfter) as Timestamp,
      product,
      userId,
      canceledAt: undefined,
    };

    let result = await service.preparePurchaseData(subscriptionCreation);

    let originalTransactionDoc: OriginalTransactionDocument = {
      _id: originalTransactionId,
      // TODO: thirdPartyId for alipay
      product: product.id,
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
      raw: undefined,
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

    return {subscription, response: result as any};
  }
}
