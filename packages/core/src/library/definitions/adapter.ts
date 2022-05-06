import type {Repository} from '../@repository';

import type {
  OriginalTransactionDocument,
  OriginalTransactionId,
} from './original-transaction';
import type {
  ProductId,
  SubscriptionTransactionDocument,
  Timestamp,
  TransactionDocument,
  TransactionId,
  UserId,
} from './transaction';

class Transaction {
  get status(): 'pending' | 'completed' | 'canceled' | 'failed' {
    if (this.transactionData.canceledAt) {
      return 'canceled';
    } else if (this.transactionData.completedAt) {
      return 'completed';
    } else if (this.transactionData.failedAt) {
      return 'failed';
    } else {
      return 'pending';
    }
  }

  constructor(private transactionData: TransactionDocument) {}
}

export class SubscriptionTransaction extends Transaction {
  constructor(transactionData: SubscriptionTransactionDocument) {
    super(transactionData);
  }
}

export class Subscription {
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

export interface IStoreAdapter<TProduct extends IProduct = IProduct> {
  type: string;
  config: unknown;
  generateTransactionId(): TransactionId;
  generateOriginalTransactionId(): OriginalTransactionId;
  getDuration(product: TProduct): Timestamp;

  createPurchase(creation: SubscriptionCreation): Promise<void>;

  createSubscription(
    creation: SubscriptionCreation<TProduct>,
  ): Promise<unknown>;
  cancelSubscription(subscription: Subscription): Promise<boolean>;

  validatePurchase(receipt: unknown): Promise<OrderPaid>;

  // parsePaid(callbackData: unknown): Promise<OrderPaid>;
  parseSigned(callbackData: unknown): Promise<SignedData>;
}

//////////////
// callback //
//////////////
export interface SignedData {
  signedAt: Timestamp;
  originalTransactionId: OriginalTransactionId;
}

export interface OrderPaid {
  callbackData: unknown;
  transactionId: TransactionId;
  status: 'success' | 'failed' | 'expired';
  paidAt: Timestamp;
}

export interface IProduct {
  id: ProductId;
  group?: string;
}

export interface SubscriptionCreation<TProduct extends IProduct = IProduct> {
  originalTransactionId: OriginalTransactionId;
  transactionId: TransactionId;
  startsAt: Timestamp;
  expiresAt: Timestamp;
  signedAt: Timestamp | undefined;
  renewalEnabled: boolean;
  product: TProduct;
  paymentExpiresAt: Timestamp;
  userId: UserId;
  canceledAt: Timestamp | undefined;
}
