import {MongoClient} from 'mongodb';
import type {Collection, Db} from 'mongodb';

import type {
  AbstractTransaction,
  OriginalTransactionDocument,
  OriginalTransactionId,
  ProductId,
  SubscriptionTransactionDocument,
  TransactionDocument,
  TransactionId,
  UserId,
} from './definitions';
import {
  PurchaseTransaction,
  Subscription,
  SubscriptionTransaction,
  User,
} from './definitions';

export type RepositoryConfig = (
  | {
      mongoClient: MongoClient;
    }
  | {url: string}
) & {database: string};

interface Collections {
  transaction: TransactionDocument | SubscriptionTransactionDocument;
  'original-transaction': OriginalTransactionDocument;
}

const COLLECTION_NAME_DICT: {[TName in keyof Collections]: string} = {
  'original-transaction': 'paying-original-transaction',
  transaction: 'paying-transaction',
};

export interface IRepository extends Repository {}

export class Repository {
  private db: Db;

  ready: Promise<void>;

  constructor(config: RepositoryConfig) {
    let client =
      'mongoClient' in config
        ? config.mongoClient
        : new MongoClient(config.url, {ignoreUndefined: true});

    this.db = client.db(config.database);
    this.ready = client.connect().then();
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

    let transactionsDocs = await this.collectionOfType('transaction')
      .find({user: userId})
      .toArray();

    let purchaseTransactions: PurchaseTransaction[] = [];
    let originalIdToTransactionMap: Map<
      OriginalTransactionId,
      SubscriptionTransaction[]
    > = new Map();

    for (const transactionDoc of transactionsDocs) {
      if (transactionDoc.type === 'purchase') {
        purchaseTransactions.push(new PurchaseTransaction(transactionDoc));
      } else if (transactionDoc.type === 'subscription') {
        let subscriptionTransactions = originalIdToTransactionMap.get(
          transactionDoc.originalTransactionId,
        );
        let subscriptionTransaction = new SubscriptionTransaction(
          transactionDoc,
        );

        if (subscriptionTransactions) {
          subscriptionTransactions.push(subscriptionTransaction);
        } else {
          originalIdToTransactionMap.set(transactionDoc.originalTransactionId, [
            subscriptionTransaction,
          ]);
        }
      }
    }

    let subscriptions: Subscription[] = [];

    for (const originalTransaction of originalTransactions) {
      subscriptions.push(
        new Subscription(
          originalTransaction,
          originalIdToTransactionMap.get(originalTransaction._id) ?? [],
          this,
        ),
      );
    }

    return new User(
      userId,
      subscriptions,
      Array.from(originalIdToTransactionMap.values()).flat(),
      purchaseTransactions,
    );
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

    let transactions =
      await this.getSubscriptionTransactionsByOriginalTransactionId(
        originalTransaction._id,
      );

    return new Subscription(originalTransaction, transactions, this);
  }

  async getSubscriptionTransactionsByOriginalTransactionId(
    id: OriginalTransactionId,
  ): Promise<SubscriptionTransaction[]> {
    return (
      await this.collectionOfType('transaction')
        .find({
          originalTransactionId: id,
          type: 'subscription',
        })
        .sort({createdAt: -1})
        .toArray()
    ).map(
      doc =>
        new SubscriptionTransaction(doc as SubscriptionTransactionDocument),
    );
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

  async requireOriginalTransaction(
    serviceName: string,
    id: OriginalTransactionId,
  ): Promise<OriginalTransactionDocument> {
    let doc = await this.getOriginalTransactionById(serviceName, id);

    if (!doc) {
      throw new Error(`Original transaction ${id} not found`);
    }

    return doc;
  }

  async requireTransaction(
    serviceName: string,
    id: TransactionId,
  ): Promise<AbstractTransaction> {
    let doc = await this.getTransactionById(serviceName, id);

    if (!doc) {
      throw new Error(`Transaction ${id} not found`);
    }

    return this.buildTransactionFromDoc(doc);
  }

  buildTransactionFromDoc(doc: TransactionDocument): AbstractTransaction {
    return doc.type === 'purchase'
      ? new PurchaseTransaction(doc)
      : new SubscriptionTransaction(doc);
  }

  collectionOfType<TType extends keyof Collections>(
    type: TType,
  ): Collection<Collections[TType]> {
    let name = COLLECTION_NAME_DICT[type];

    return this.db.collection(name);
  }
}
