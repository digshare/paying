import type {Subscription} from './original-transaction';
import type {Timestamp, UserId} from './transaction';

export class User {
  private identifierToSubscriptionsMap: Map<string, Subscription[]>;

  constructor(public id: UserId, public subscriptions: Subscription[]) {
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

    for (let transaction of subscriptions) {
      if (transaction.startsAt! <= expiresAt) {
        expiresAt += transaction.expiresAt! - transaction.startsAt!;
      } else {
        if (transaction.startsAt! > now) {
          break;
        }

        // startsAt = transaction.startsAt!;
        expiresAt = transaction.expiresAt!;
      }
    }

    return expiresAt as Timestamp;
  }
}
