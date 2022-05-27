import type {Nominal} from 'tslang';

import type {Repository} from '../repository';
import {maxBy} from '../utils';

import type {
  ProductId,
  SubscriptionTransaction,
  Timestamp,
  UserId,
} from './transaction';

export type OriginalTransactionId = Nominal<string, 'original-transaction-id'>;

export interface OriginalTransactionDocument {
  _id: OriginalTransactionId;
  // 在有效期内的订阅
  product: ProductId;
  // 下一次订阅
  renewalProduct: string | undefined;
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
  lastFailedAt?: Timestamp;
  user: UserId;
  service: string;
  serviceExtra: unknown | undefined;
}

export class Subscription {
  get id(): OriginalTransactionId {
    return this.originalTransaction._id;
  }

  get productIdentifier(): string {
    return (
      this.originalTransaction.productGroup ?? this.originalTransaction.product
    );
  }

  get expiresAt(): Timestamp | undefined {
    return this.originalTransaction.expiresAt;
  }

  get startsAt(): Timestamp | undefined {
    return this.originalTransaction.startsAt;
  }

  get renewalEnabled(): boolean {
    return this.originalTransaction.renewalEnabled;
  }

  get status(): 'pending' | 'expired' | 'canceled' | 'active' | 'not-start' {
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
      return 'not-start';
    }

    return 'active';
  }

  get latestTransaction(): SubscriptionTransaction | undefined {
    return maxBy(this.transactions, transaction => transaction.createdAt);
  }

  constructor(
    public originalTransaction: OriginalTransactionDocument,
    public transactions: SubscriptionTransaction[],
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
