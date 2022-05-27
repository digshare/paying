import type {Nominal} from 'tslang';
import * as x from 'x-value';

import type {OriginalTransactionId} from './original-transaction';

export type TransactionId = Nominal<string, 'transaction-id'>;

export const Timestamp = x.number.nominal<'timestamp'>();
export type Timestamp = x.TypeOf<typeof Timestamp>;

export const ProductId = x.string.nominal<'product-id'>();
export type ProductId = x.TypeOf<typeof ProductId>;

export const UserId = x.string.nominal<'user-id'>();
export type UserId = x.TypeOf<typeof UserId>;

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

/**
 * startsAt 在第一次创建 original-transaction 时会被 apply在后续续费的
 * transaction 确认后，original-transaction 会在原有的 expiresAt 基础上叠加
 * duration, 此时 startsAt 无效. 即 startsAt 在续费时默认为上一次的 expiresAt
 */
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

export abstract class AbstractTransaction {
  get id(): TransactionId {
    return this.doc._id;
  }

  get status(): 'pending' | 'completed' | 'canceled' | 'failed' {
    if (this.doc.canceledAt) {
      return 'canceled';
    } else if (this.doc.completedAt) {
      return 'completed';
    } else if (this.doc.failedAt) {
      return 'failed';
    } else {
      return 'pending';
    }
  }

  get productId(): ProductId {
    return this.doc.product;
  }

  constructor(public doc: TransactionDocument) {}
}

export class SubscriptionTransaction extends AbstractTransaction {
  get originalTransactionId(): OriginalTransactionId {
    return this.doc.originalTransactionId;
  }

  get duration(): number {
    return this.doc.duration;
  }

  get startsAt(): Timestamp {
    return this.doc.startsAt;
  }

  get canceledAt(): Timestamp | undefined {
    return this.doc.canceledAt;
  }

  get completedAt(): Timestamp | undefined {
    return this.doc.completedAt;
  }

  get createdAt(): Timestamp {
    return this.doc.createdAt;
  }

  constructor(public override doc: SubscriptionTransactionDocument) {
    super(doc);
  }
}

export class PurchaseTransaction extends AbstractTransaction {
  constructor(public override doc: PurchaseTransactionDocument) {
    super(doc);
  }
}
