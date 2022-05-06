import ms from 'ms';

import type {RepositoryConfig} from './@repository';
import {Repository} from './@repository';
import type {
  IProduct,
  IStoreAdapter,
  OriginalTransactionDocument,
  SubscriptionCreation,
  SubscriptionTransactionDocument,
  Timestamp,
  UserId,
} from './definitions';
import {Subscription} from './definitions';

interface SubscriptionCreateOptions<TProduct extends IProduct> {
  startsAt: Timestamp;
  expiresAt: Timestamp;
  product: TProduct;
  userId: UserId;
}

export class Store<TStoreAdapter extends IStoreAdapter> {
  private repository: Repository;

  constructor(
    private adapter: TStoreAdapter,
    repositoryConfig: RepositoryConfig,
  ) {
    this.repository = new Repository(repositoryConfig);
  }

  async createSubscription(
    createOptions: SubscriptionCreateOptions<
      Parameters<TStoreAdapter['createSubscription']>[0]['product']
    >,
  ): Promise<{
    subscription: Subscription;
    addition: Awaited<ReturnType<TStoreAdapter['createSubscription']>>;
  }> {
    let now = new Date().getTime() as Timestamp;
    let {startsAt, expiresAt, product, userId} = createOptions;

    let originalTransactionId = this.adapter.generateOriginalTransactionId();
    let transactionId = this.adapter.generateTransactionId();

    let subscriptionCreation: SubscriptionCreation = {
      originalTransactionId,
      transactionId,
      startsAt,
      expiresAt,
      signedAt: undefined,
      renewalEnabled: false,
      paymentExpiresAt: (now + ms('10 min')) as Timestamp,
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
      startsAt,
      expiresAt,
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
      expiresAt,
      product: product.id,
      productGroup: product.group,
      user: userId,
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

    let subscription = new Subscription(originalTransactionDoc, [
      transactionDoc,
    ]);

    return {subscription, addition: result as any};
  }

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

    if (!transactionDoc.expiresAt) {
      throw new Error(`expiresAt should be set on transition creating.`);
    }

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
          expiresAt: transactionDoc.expiresAt,
        },
      },
    );
  }
}
