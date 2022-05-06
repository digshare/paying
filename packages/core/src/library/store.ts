import ms from 'ms';

import type {RepositoryConfig} from './@repository';
import {Repository} from './@repository';
import type {
  IProduct,
  IStoreAdapter,
  OriginalTransactionDocument,
  Subscription,
  SubscriptionCreation,
  SubscriptionTransactionDocument,
  Timestamp,
  UserId,
} from './definitions';

interface CreateOrUpdateSubscriptionOptions<
  TStoreAdapter extends IStoreAdapter,
> {
  product: InferProduct<TStoreAdapter>;
  userId: UserId;
}

interface StoreConfig {
  repository: RepositoryConfig;
  purchaseExpiresAfter: number;
}

type InferProduct<TStoreAdapter extends IStoreAdapter> = Parameters<
  TStoreAdapter['createSubscription']
>[0]['product'];

export class Store<TStoreAdapter extends IStoreAdapter> {
  private repository: Repository;

  constructor(private adapter: TStoreAdapter, public config: StoreConfig) {
    this.repository = new Repository(config.repository);
  }

  async createOrUpdateSubscription(
    options: CreateOrUpdateSubscriptionOptions<TStoreAdapter>,
  ): Promise<void> {
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
      await this.cancelSubscription(activeSubscription);
    }

    await this.createSubscription(options);
  }

  async handleNotification(): Promise<void> {}

  async handleSignedCallback(data: unknown): Promise<void> {
    let signed = await this.adapter.parseSigned(data);

    let {signedAt, originalTransactionId} = signed;

    let originalTransaction = await this.repository.getOriginalTransactionById(
      originalTransactionId,
    );

    if (!originalTransaction) {
      throw new Error(
        `Original transaction ${originalTransactionId} not found`,
      );
    }

    await this.repository
      .collectionOfType('original-transaction')
      .updateOne({_id: originalTransactionId}, {$set: {signedAt, raw: data}});
  }

  async handlePaidCallback(data: unknown): Promise<void> {
    let now = new Date().getTime() as Timestamp;
    let paid = await this.adapter.validatePurchase(data);

    let {transactionId, paidAt} = paid;

    let transactionDoc = await this.repository.getSubscriptionTransactionById(
      transactionId,
    );

    if (!transactionDoc) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (transactionDoc.completedAt) {
      throw new Error(
        'MembershipSubscriptionTransaction has already been completed.',
      );
    }

    let startsAt = transactionDoc.startsAt;
    // TODO: 续费
    let expiresAt = (transactionDoc.duration + startsAt) as Timestamp;

    await this.repository.collectionOfType('transaction').updateOne(
      {
        _id: transactionId,
      },
      {
        $set: {
          completedAt: now,
          purchasedAt: paidAt,
          raw: data,
        },
        $unset: {
          paymentExpiresAt: true,
        },
      },
    );

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

  async cancelSubscription(subscription: Subscription): Promise<void> {
    let canceled = await this.adapter.cancelSubscription(subscription);

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
      throw new Error('Subscription should be canceled before re-creating.');
    }
  }

  private async createSubscription({
    product,
    userId,
  }: CreateOrUpdateSubscriptionOptions<TStoreAdapter>): Promise<{
    subscription: Subscription;
    payload: Awaited<ReturnType<TStoreAdapter['createSubscription']>>;
  }> {
    let now = new Date().getTime() as Timestamp;

    let originalTransactionId = this.adapter.generateOriginalTransactionId();
    let transactionId = this.adapter.generateTransactionId();
    let duration = this.adapter.getDuration(product);

    let startsAt = now;
    let expiresAt = (now + duration) as Timestamp;

    let subscriptionCreation: SubscriptionCreation = {
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

    let result = await this.adapter.createSubscription(subscriptionCreation);

    let originalTransactionDoc: OriginalTransactionDocument = {
      _id: originalTransactionId,
      // TODO: thirdPartyId for alipay
      product: product.id,
      productGroup: product.group,
      startsAt: undefined,
      createdAt: now,
      expiresAt: undefined,
      signedAt: undefined,
      canceledAt: undefined,
      cancelReason: undefined,
      renewalEnabled: false,
      lastFailedReason: undefined,
      user: userId,
      type: this.adapter.type,
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
      type: this.adapter.type,
      raw: undefined,
    };

    await this.repository.createOriginalTransaction(originalTransactionDoc);
    await this.repository.createTransaction(transactionDoc);

    let subscription = (await this.repository.getSubscriptionById(
      originalTransactionId,
    ))!;

    return {subscription, payload: result as any};
  }
}
