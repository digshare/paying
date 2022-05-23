import type {Subscription} from './original-transaction';
import type {
  PurchaseTransaction,
  SubscriptionTransaction,
  Timestamp,
  UserId,
} from './transaction';

export class User {
  private identifierToSubscriptionsMap: Map<string, Subscription[]>;

  constructor(
    public id: UserId,
    public subscriptions: Subscription[],
    public subscriptionTransactions: SubscriptionTransaction[],
    public purchaseTransactions: PurchaseTransaction[],
  ) {
    this.identifierToSubscriptionsMap = this.subscriptions.reduce(
      (map, subscription) => {
        let subscriptions = map.get(subscription.productIdentifier);

        if (subscriptions) {
          map.set(subscription.productIdentifier, [
            ...subscriptions,
            subscription,
          ]);
        } else {
          map.set(subscription.productIdentifier, [subscription]);
        }

        return map;
      },
      new Map<string, Subscription[]>(),
    );
  }

  getExpireTime(productIdentifier: string): Timestamp {
    let subscriptions =
      this.identifierToSubscriptionsMap.get(productIdentifier) ?? [];
    let now = Date.now() as Timestamp;

    // let startsAt = 0;
    let expiresAt = 0;

    subscriptions.sort((x, y) => x.startsAt! - y.startsAt!);

    for (let subscription of subscriptions) {
      if (subscription.startsAt! <= expiresAt) {
        expiresAt += subscription.expiresAt! - subscription.startsAt!;
      } else {
        if (subscription.startsAt! > now) {
          break;
        }

        // startsAt = transaction.startsAt!;
        expiresAt = subscription.expiresAt!;
      }
    }

    return expiresAt as Timestamp;
  }
}
