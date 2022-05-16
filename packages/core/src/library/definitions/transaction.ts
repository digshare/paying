import type {Nominal} from 'tslang';

import type {OriginalTransactionId} from './original-transaction';

export type Timestamp = Nominal<number, 'timestamp'>;
export type TransactionId = Nominal<string, 'transaction-id'>;
export type ProductId = Nominal<string, 'product-id'>;

export type UserId = Nominal<string, 'user-id'>;

export type TransactionType = 'purchase' | 'subscription';

interface ITransactionDocument<TType extends TransactionType> {
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
  service: string;
  type: TType;
  raw: any;
}

export interface PurchaseTransactionDocument
  extends ITransactionDocument<'purchase'> {}

export interface SubscriptionTransactionDocument
  extends ITransactionDocument<'subscription'> {
  type: 'subscription';
  originalTransactionId: OriginalTransactionId;
  startsAt: Timestamp;
  duration: number;
}

export type TransactionDocument =
  | PurchaseTransactionDocument
  | SubscriptionTransactionDocument;

export class Transaction {
  get id(): TransactionId {
    return this.transactionDoc._id;
  }

  get originalTransactionId(): OriginalTransactionId | undefined {
    return this.transactionDoc.type === 'subscription'
      ? this.transactionDoc.originalTransactionId
      : undefined;
  }

  get status(): 'pending' | 'completed' | 'canceled' | 'failed' {
    if (this.transactionDoc.canceledAt) {
      return 'canceled';
    } else if (this.transactionDoc.completedAt) {
      return 'completed';
    } else if (this.transactionDoc.failedAt) {
      return 'failed';
    } else {
      return 'pending';
    }
  }

  constructor(private transactionDoc: TransactionDocument) {}
}

export class SubscriptionTransaction extends Transaction {
  constructor(transactionData: SubscriptionTransactionDocument) {
    super(transactionData);
  }
}
