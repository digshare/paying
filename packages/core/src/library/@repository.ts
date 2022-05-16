import type {Collection, Db} from 'mongodb';
import {MongoClient} from 'mongodb';

import type {
  OriginalTransactionDocument,
  OriginalTransactionId,
  ProductId,
  SubscriptionTransactionDocument,
  TransactionDocument,
  TransactionId,
  UserId,
} from './definitions';
import {Subscription, User} from './definitions';

export interface RepositoryConfig {
  url: string;
  dbName: string;
}

interface Collections {
  transaction: TransactionDocument | SubscriptionTransactionDocument;
  'original-transaction': OriginalTransactionDocument;
}

const COLLECTION_NAME_DICT: {[TName in keyof Collections]: string} = {
  'original-transaction': 'paying-original-transaction',
  transaction: 'paying-transaction',
};

export class Repository {
  private db: Db;

  constructor(private config: RepositoryConfig) {
    let client = new MongoClient(config.url);
    this.db = client.db(config.dbName);
  }

  async createTransaction(transaction: TransactionDocument): Promise<void> {
    await this.collectionOfType('transaction').insertOne(transaction);
  }

  async createOriginalTransaction(
    originalTransaction: OriginalTransactionDocument,
  ): Promise<void> {
    await this.collectionOfType('original-transaction').insertOne(
      originalTransaction,
    );
  }

  async getUserById(userId: UserId): Promise<User> {
    let originalTransactions = await this.collectionOfType(
      'original-transaction',
    )
      .find({
        user: userId,
      })
      .toArray();

    let subscriptions: Subscription[] = [];

    for (const originalTransaction of originalTransactions) {
      subscriptions.push(
        new Subscription(
          originalTransaction,
          await this.getSubscriptionTransactionsByOriginalTransactionId(
            originalTransaction._id,
          ),
          this,
        ),
      );
    }

    return new User(userId, subscriptions);
  }

  async getSubscriptionById(
    serviceName: string,
    originalTransactionId: OriginalTransactionId,
  ): Promise<Subscription | undefined> {
    let originalTransaction = await this.getOriginalTransactionById(
      serviceName,
      originalTransactionId,
    );

    if (!originalTransaction) {
      return undefined;
    }

    let transactions =
      await this.getSubscriptionTransactionsByOriginalTransactionId(
        originalTransactionId,
      );

    return new Subscription(originalTransaction, transactions, this);
  }

  async getActiveSubscriptionTransactionsByUserIdInGroup(
    userId: UserId,
    group: string,
  ): Promise<Subscription | undefined> {
    let originalTransaction = await this.collectionOfType(
      'original-transaction',
    ).findOne({
      productGroup: group,
      user: userId,
      canceledAt: {$exists: false},
    });

    if (!originalTransaction) {
      return undefined;
    }

    let transactions =
      await this.getSubscriptionTransactionsByOriginalTransactionId(
        originalTransaction._id,
      );

    return new Subscription(originalTransaction, transactions, this);
  }

  async getSubscriptionByUserAndProductId(
    productId: ProductId,
    userId: UserId,
  ): Promise<Subscription | undefined> {
    let originalTransaction = await this.collectionOfType(
      'original-transaction',
    ).findOne({
      product: productId,
      user: userId,
    });

    if (!originalTransaction) {
      return undefined;
    }

    let transactions = (await this.collectionOfType('transaction')
      .find({
        originalTransactionId: originalTransaction._id,
      })
      .sort({createdAt: -1})
      .toArray()) as SubscriptionTransactionDocument[];

    return new Subscription(originalTransaction, transactions, this);
  }

  async getSubscriptionTransactionsByOriginalTransactionId(
    id: OriginalTransactionId,
  ): Promise<SubscriptionTransactionDocument[]> {
    return (await this.collectionOfType('transaction')
      .find({
        originalTransactionId: id,
        type: 'subscription',
      })
      .sort({createdAt: -1})
      .toArray()) as SubscriptionTransactionDocument[];
  }

  async getTransactionById(
    serviceName: string,
    transactionId: TransactionId,
  ): Promise<TransactionDocument | undefined> {
    let doc = await this.collectionOfType('transaction').findOne({
      _id: transactionId,
      service: serviceName,
    });

    return doc ?? undefined;
  }

  async getOriginalTransactionById(
    serviceName: string,
    originalTransactionId: OriginalTransactionId,
  ): Promise<OriginalTransactionDocument | undefined> {
    let doc = await this.collectionOfType('original-transaction').findOne({
      _id: originalTransactionId,
      service: serviceName,
    });

    return doc ?? undefined;
  }

  collectionOfType<TType extends keyof Collections>(
    type: TType,
  ): Collection<Collections[TType]> {
    let name = COLLECTION_NAME_DICT[type];

    return this.db.collection(name);
  }
}
