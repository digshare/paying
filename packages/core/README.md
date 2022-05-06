# @enverse-pay/core

Just another awesome magic.

## License

MIT License.

```typescript
// Store
class Store {
  constructor(adapter: IAdapter, config: StoreConfig) {}

  createSubscription(options: SubscriptionCreateOptions): Promise<Subscription>;

  cancelSubscription(
  subscription: Subscription,
  options: CancelOptions,
): Transaction;

  changeSubscription(options: SubscriptionChangeOptions): Promise<Subscription>;

  createPurchase(purchaseCreateOptions: PurchaseCreateOptions): Transaction;

  refundPurchase(transaction: Transaction, options: RefundOptions): Transaction;


  validatePurchase(
    receipt: Receipt,
  ): Promise<{transaction: Transaction; subscription?: Subscription}>;

  handleNotification(data: unknown): {
    type: 'purchase';
    event: 'wait-to-pay' | 'closed' | 'success' | 'finished' | 'refund';
    transaction: Transaction;
  };
  handleNotification(data: unknown): {
    type: 'subscription';
    event:
      | 'subscribed'
      | 'cancelled'
      | 'expired'
      | 'failed-to-renew'
      | 'refund'
      | 'renewal-status-changed';
    subscription: Subscription;
  };

  // schedule tasks
  checkSubscriptionStatus(concurrent: number): Transaction;

  checkTransactionStatus(concurrent: number): Transaction;
}

// Adapter
interface IAdapter {
  type: string;
  config: unknown;

  generateTransactionId(): TransactionId;

  generateOriginalTransactionId(): OriginalTransactionId;

  createPurchase(options: CreatePurchaseOptions): Promise<void>;

  createSubscription(
    creation: SubscriptionCreation<TProduct>,
  ): Promise<unknown>;

  cancelSubscription(subscription: Subscription): Promise<void>;

  refundPurchase(transaction: Transaction, options: RefundOptions): Transaction;


  parseCallback(receipt: unknown): Promise<{transaction: Transaction: Subscription: Subscription}>;
}

// Subscription

class Subscription<TProduct extends IProduct> {
  status: 'active' | 'cancelled' | 'expired' | 'pending-renewal';
  expiresAt: Timestamp;
  startsAt: Timestamp;
  product: TProduct;
  transactions: Transaction[];
  originalTransactionId: OriginalTransactionId;
}

class Transaction<TProduct extends IProduct> {
  status: 'pending' | 'success' | 'failed' | 'refunded';
  transactionId: TransactionId;
  product: TProduct;
  subscription: Subscription;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  purchaseExpiresAt: Timestamp;
  cancelledAt: Timestamp;
}

class SubscriptionTransaction<TProduct extends IProduct> extends Transaction<TProduct> {
  originalTransactionId: OriginalTransactionId;
  expiresAt: Timestamp;
  startsAt: Timestamp;
  paidAt: Timestamp;
}
```
