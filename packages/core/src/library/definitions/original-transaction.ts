import type {Nominal} from 'tslang';

import type {Repository} from '../@repository';

import type {
  SubscriptionTransactionDocument,
  Timestamp,
  UserId,
} from './transaction';

export type OriginalTransactionId = Nominal<string, 'original-transaction-id'>;

export interface OriginalTransactionDocument {
  _id: OriginalTransactionId;
  // thirdPartyId: string | undefined;
  product: string;
  productGroup: string | undefined;

  createdAt: Timestamp;
  /**
   * starts at 和 expires at 未设置时代表创建但未支付，当支付后才会更新
   */
  startsAt: Timestamp | undefined;
  expiresAt: Timestamp | undefined;
  subscribedAt: Timestamp | undefined;
  canceledAt: Timestamp | undefined;

  cancelReason: unknown | undefined;
  renewalEnabled: boolean;
  lastFailedReason?: unknown;
  user: UserId;
  service: string;
  raw: unknown | undefined;
}

export class Subscription {
  get id(): OriginalTransactionId {
    return this.originalTransaction._id;
  }

  get status(): 'pending' | 'expired' | 'canceled' | 'active' | 'not-started' {
    if (this.originalTransaction.canceledAt) {
      return 'canceled';
    }

    if (
      !this.originalTransaction.expiresAt ||
      !this.originalTransaction.startsAt
    ) {
      return 'pending';
    }

    if (this.originalTransaction.expiresAt < Date.now()) {
      return 'expired';
    }

    if (this.originalTransaction.startsAt > Date.now()) {
      return 'not-started';
    }

    return 'active';
  }

  constructor(
    public originalTransaction: OriginalTransactionDocument,
    public transactions: SubscriptionTransactionDocument[],
    private repository: Repository,
  ) {}

  async refresh(): Promise<this> {
    let originalTransaction = await this.repository.getOriginalTransactionById(
      this.originalTransaction.service,
      this.originalTransaction._id,
    );
    let transactions =
      await this.repository.getSubscriptionTransactionsByOriginalTransactionId(
        this.originalTransaction._id,
      );

    if (!originalTransaction) {
      throw new Error('Transaction has been removed');
    }

    this.originalTransaction = originalTransaction;
    this.transactions = transactions;

    return this;
  }
}
