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
  constructor(
    private originalTransaction: OriginalTransactionDocument,
    private transactions: SubscriptionTransactionDocument[],
  ) {}
}

export interface IStoreAdapter<TProduct extends IProduct = IProduct> {
  type: string;
  config: unknown;
  generateTransactionId(): TransactionId;
  generateOriginalTransactionId(): OriginalTransactionId;

  createPurchase(creation: SubscriptionCreation): Promise<void>;
  createSubscription(
    creation: SubscriptionCreation<TProduct>,
  ): Promise<unknown>;

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
