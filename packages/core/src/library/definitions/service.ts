import type {OriginalTransactionId, Subscription} from './original-transaction';
import type {ProductId, Timestamp, TransactionId, UserId} from './transaction';

export interface PaymentAction {
  type: 'payment';
  transactionId: TransactionId;
  purchasedAt: Timestamp;
}

export interface SubscribedAction {
  type: 'subscribed';
  originalTransactionId: OriginalTransactionId;
  subscribedAt: Timestamp;
}

export type Action = PaymentAction | SubscribedAction;

export interface PrepareSubscriptionOptions<TProduct extends IProduct> {
  product: TProduct;
  userId: UserId;
}

export interface PreparePurchaseOptions<TProduct extends IProduct> {
  product: TProduct;
  userId: UserId;
}

export type ApplyingReceipt<TProduct extends IProduct> =
  | {
      type: 'subscription';
      prepare: PrepareSubscriptionOptions<TProduct>;
      submit: {
        subscribed: SubscribedAction;
        payment: PaymentAction;
      };
    }
  | {
      type: 'purchase';
      prepare: PreparePurchaseOptions<TProduct>;
      submit: PaymentAction;
    };

export interface CancelSubscriptionOptions {
  subscription: Subscription;
}

export abstract class IPayingService<TProduct extends IProduct = IProduct> {
  __productType: TProduct = undefined as any;

  abstract generateTransactionId(): TransactionId;
  abstract generateOriginalTransactionId(): OriginalTransactionId;
  abstract getDuration(product: TProduct): number;

  abstract prepareSubscriptionData(
    options: PayingServiceSubscriptionPrepareOptions<TProduct>,
  ): Promise<unknown>;
  abstract preparePurchaseData(
    options: PurchaseCreation<TProduct>,
  ): Promise<unknown>;
  // preparePurchase(options: SubscriptionCreation): Promise<void>;
  // submitPurchase(options: SubscriptionCreation): Promise<void>;
  abstract parseReceipt(receipt: unknown): Promise<ApplyingReceipt<TProduct>>;
  abstract parseCallback(callback: unknown): Promise<Action>;

  abstract cancelSubscription(
    options: CancelSubscriptionOptions,
  ): Promise<boolean>;

  async didCreateSubscription(): Promise<void> {}

  async didSubmitSubscription(): Promise<void> {}

  async didCreatePurchase(): Promise<void> {}

  async didSubmitPurchase(): Promise<void> {}

  // prepareSubscription(
  //   creation: SubscriptionCreation<TProduct>,
  // ): Promise<unknown>;
  // submitSubscription(subscription: Subscription): Promise<boolean>;
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
  expiresAt: Timestamp;
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
