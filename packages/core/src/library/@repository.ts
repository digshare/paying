import type {Collection, Db} from 'mongodb';
import {MongoClient} from 'mongodb';

import type {
  OriginalTransactionDocument,
  OriginalTransactionId,
  SubscriptionTransactionDocument,
  TransactionDocument,
  TransactionId,
} from './definitions';

export interface RepositoryConfig {
  url: string;
  dbName: string;
}

interface Collections {
  transaction: TransactionDocument;
  'original-transaction': OriginalTransactionDocument;
}

const COLLECTION_NAME_DICT: {[TName in keyof Collections]: string} = {
  'original-transaction': 'enverse-original-transaction',
  transaction: 'enverse-transaction',
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

  async getTransactionById(
    transactionId: TransactionId,
  ): Promise<TransactionDocument | undefined> {
    let doc = (await this.db
      .collection('enverse-pay-transactions')
      .findOne({_id: transactionId})) as TransactionDocument | null;

    return doc ?? undefined;
  }

  async getSubscriptionTransactionById(
    transactionId: TransactionId,
  ): Promise<SubscriptionTransactionDocument | undefined> {
    let doc = (await this.db
      .collection('enverse-pay-transactions')
      .findOne({_id: transactionId})) as SubscriptionTransactionDocument | null;

    return doc ?? undefined;
  }

  async getOriginalTransactionById(
    originalTransactionId: OriginalTransactionId,
  ): Promise<OriginalTransactionDocument | undefined> {
    let doc = await this.collectionOfType('original-transaction').findOne({
      _id: originalTransactionId,
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
