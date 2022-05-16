import type {
  OriginalTransactionDocument,
  OriginalTransactionId,
  Subscription,
} from './original-transaction';
import type {ProductId, Timestamp, TransactionId, UserId} from './transaction';

export interface PaymentConfirmedAction {
  type: 'payment-confirmed';
  transactionId: TransactionId;
  purchasedAt: Timestamp;
}

export interface SubscriptionRenewalAction {
  type: 'subscription-renewal';
  transactionId: TransactionId;
  purchasedAt: Timestamp;
  startsAt: Timestamp;
  expiresAt: Timestamp;
  originalTransactionId: OriginalTransactionId;
  product: IProduct;
}

export interface ChangeRenewalStatusAction {
  type: 'change-renewal-status';
  originalTransactionId: OriginalTransactionId;
  renewalEnabled: boolean;
}

export interface ChangeRenewalInfoAction {
  type: 'change-renewal-info';
  originalTransactionId: OriginalTransactionId;
  renewalEnabled: boolean;
  autoRenewProductId: ProductId;
  productId: ProductId;
}

export interface SubscribedAction {
  type: 'subscribed';
  originalTransactionId: OriginalTransactionId;
  subscribedAt: Timestamp;
  extra?: any;
}

export interface SubscriptionCanceledAction {
  type: 'subscription-canceled';
  originalTransactionId: OriginalTransactionId;
  canceledAt: Timestamp;
  reason?: any;
}

export interface RechargeFailed {
  type: 'recharge-failed';
  originalTransactionId: OriginalTransactionId;
  reason: any;
  failedAt: Timestamp;
}

export type Action =
  | PaymentConfirmedAction
  | SubscribedAction
  | SubscriptionRenewalAction
  | ChangeRenewalStatusAction
  | ChangeRenewalInfoAction
  | SubscriptionCanceledAction
  | RechargeFailed;

export interface SubscriptionReceipt<TProduct extends IProduct> {
  originalTransactionId: OriginalTransactionId;
  transactionId: TransactionId;
  purchasedAt: Timestamp;
  expiresAt: Timestamp;
  subscribedAt: Timestamp;
  product: TProduct;
  autoRenewal: boolean;
  // TODO: optional??
  autoRenewalProduct: TProduct | undefined;
}

export interface PurchaseReceipt<TProduct extends IProduct> {
  quantity: number;
  product: TProduct;
  transactionId: TransactionId;
  purchasedAt: Timestamp;
}

export interface ApplyingReceipt<TProduct extends IProduct> {
  subscription?: SubscriptionReceipt<TProduct>;
  purchase: PurchaseReceipt<TProduct>[];
}

export interface CancelSubscriptionOptions {
  subscription: Subscription;
}

export interface PrepareSubscriptionReturn {
  response: unknown;
  duration: number;
}

export type TransactionStatusCheckingResult =
  | {type: 'success'; purchasedAt: Timestamp}
  | {type: 'canceled'; canceledAt: Timestamp; reason?: string | {}}
  | {type: 'pending'};

export type SubscriptionStatusCheckingResult =
  | {type: 'subscribed'; subscribedAt: Timestamp}
  | {type: 'canceled'; canceledAt: Timestamp; reason?: string | {}}
  | {type: 'pending'};

export abstract class IPayingService<TProduct extends IProduct = IProduct> {
  __productType: TProduct = undefined as any;

  productIdToProductMap: Map<ProductId, TProduct>;

  constructor(public products: TProduct[]) {
    this.productIdToProductMap = new Map(
      products.map(product => [product.id, product]),
    );
  }

  abstract generateTransactionId(): TransactionId;
  abstract generateOriginalTransactionId(): OriginalTransactionId;

  abstract prepareSubscriptionData(
    options: PayingServiceSubscriptionPrepareOptions<TProduct>,
  ): Promise<PrepareSubscriptionReturn>;
  abstract preparePurchaseData(
    options: PurchaseCreation<TProduct>,
  ): Promise<unknown>;
  // preparePurchase(options: SubscriptionCreation): Promise<void>;
  // submitPurchase(options: SubscriptionCreation): Promise<void>;
  abstract parseReceipt(receipt: unknown): Promise<ApplyingReceipt<TProduct>>;
  abstract parseCallback(callback: unknown): Promise<Action | undefined>;

  abstract rechargeSubscription(
    originalTransaction: OriginalTransactionDocument,
    paymentExpiresAt: Timestamp,
  ): Promise<Action | undefined>;

  abstract cancelSubscription(
    options: CancelSubscriptionOptions,
  ): Promise<boolean>;

  abstract queryTransactionStatus(
    transactionId: TransactionId,
  ): Promise<TransactionStatusCheckingResult>;

  abstract querySubscriptionStatus(
    originalTransactionId: OriginalTransactionId,
  ): Promise<SubscriptionStatusCheckingResult>;

  async didCreateSubscription(): Promise<void> {}

  async didSubmitSubscription(): Promise<void> {}

  async didCreatePurchase(): Promise<void> {}

  async didSubmitPurchase(): Promise<void> {}

  requireProduct(id: ProductId): TProduct {
    let product = this.productIdToProductMap.get(id);

    if (!product) {
      throw new Error(`Product ${id} not found`);
    }

    return product;
  }
}

export interface IProduct {
  id: ProductId;
  group?: string;
}

export interface PayingServiceSubscriptionPrepareOptions<
  TProduct extends IProduct = IProduct,
> {
  originalTransactionId: OriginalTransactionId;
  transactionId: TransactionId;
  startsAt: Timestamp;
  signedAt: Timestamp | undefined;
  renewalEnabled: boolean;
  product: TProduct;
  paymentExpiresAt: Timestamp;
  userId: UserId;
  canceledAt: Timestamp | undefined;
}

export interface PurchaseCreation<TProduct extends IProduct = IProduct> {
  transactionId: TransactionId;
  product: TProduct;
  paymentExpiresAt: Timestamp;
  userId: UserId;
}
