import {v4 as uuid} from 'uuid';

import type {OriginalTransactionId, TransactionId} from '../library';

export const dbName = 'paying-test';

export function generateTransactionId(): TransactionId {
  return uuid() as TransactionId;
}

export function generateOriginalTransactionId(): OriginalTransactionId {
  return uuid() as OriginalTransactionId;
}
