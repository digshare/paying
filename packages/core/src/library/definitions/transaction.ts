import type {Nominal} from 'tslang';

import type {OriginalTransactionId} from './original-transaction';

export type Timestamp = Nominal<number, 'timestamp'>;
export type TransactionId = Nominal<string, 'transaction-id'>;
export type ProductId = Nominal<string, 'product-id'>;

export type UserId = Nominal<string, 'user-id'>;

export interface TransactionDocument {
  _id: TransactionId;
  // 注意 productId 可能为字符串常量，当来自控制台送会员的时候
  product: ProductId;
  productGroup: string | undefined;
  user: UserId;

  createdAt: Timestamp;
  purchasedAt: Timestamp | undefined;
  completedAt: Timestamp | undefined;
  canceledAt: Timestamp | undefined;
  cancelReason: unknown | undefined;
  paymentExpiresAt: Timestamp | undefined;
  failedAt: Timestamp | undefined;

  lastFailedReason?: unknown;
  type: string;
  raw: any;
}

export interface SubscriptionTransactionDocument extends TransactionDocument {
  originalTransactionId: OriginalTransactionId;
  startsAt: Timestamp;
  duration: number;
}
