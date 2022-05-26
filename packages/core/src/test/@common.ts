import {MongoClient} from 'mongodb';
import {v4 as uuid} from 'uuid';

import type {OriginalTransactionId, TransactionId} from '../library';

export let mongoClient = new MongoClient('mongodb://localhost:27017', {
  ignoreUndefined: true,
});
export const dbName = 'paying-test';

export function generateTransactionId(): TransactionId {
  return uuid() as TransactionId;
}

export function generateOriginalTransactionId(): OriginalTransactionId {
  return uuid() as OriginalTransactionId;
}
