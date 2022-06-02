# Paying

A Node.js module for subscription and purchase processing.

![example workflow](https://github.com/digshare/paying/actions/workflows/.github/workflows/ci.yml/badge.svg)

# Installation

```bash
yarn add paying
# or
npm install paying
```

# Requirements

- MongoDB
- Node.js

# Usage

## Initialization

```ts
const paying = new Paying(
  {
    // every different payment method has its own configuration
    // check the service's documentation for more information
    alipay: new AlipayService(),
    'apple-iap': new AppleIAPService(),
  },
  {repository: {url: 'mongodb://localhost:27017', database: 'paying-db'}},
);
```

## Managed service

> "Managed service" means the data is managed by the paying service provider. like Apple IAP, Google Play, etc.

> When you are using a managed service, all the data is synced from the service provider. so the operations like: renewal, cancellation, change subscription plan. are all managed by the service provider. and you can't do these operations programmatically.

- Handle receipt

  ```ts
  await paying.handleReceipt("apple-iap", userId, <received-receipt>);

  let user = paying.user(userId);
  // if receipt is valid, and contains a active subscription:

  console.log(user.subscriptions[0].isActive); // true
  ```

- Handle callback

  ```ts
  router('/apple/callback', req => {
    await paying.handleCallback('apple-iap', req);
  });
  ```

## Unmanaged service

> Opposite with managed service. The data and subscription is managed by yourself, like Alipay or something else. you can send a renewal or cancellation request to the paying service provider programmatically. and run several cron job to check transaction / subscription status periodically.

- **prepare a subscription**

  ```ts
  let {subscription, response} = await paying.prepareSubscription('alipay', {
    product: {id: 'monthly' as ProductId, group: 'membership'},
    userId: 'xiaoming' as UserId,
  });

  subscription.status === 'pending'; // true

  // return response to client to send an purchase
  ```

- There are two ways to **confirm a subscription status**.

  1. Check subscription and payment status

     ```ts
     await paying.checkTransaction('alipay', subscription.latestTransaction.id);

     await subscription.refresh();

     // if user paid:
     subscription.status === 'active'; // true

     // or maybe user canceled:
     subscription.status === 'canceled'; // true

     // or maybe still pending:
     ```

  2. Handle callback to update payment status

     ```ts
     router('/alipay/callback', req => {
       await paying.handleCallback('alipay', req.data);

       await subscription.refresh();

       // if user paid:
       subscription.status === 'active'; // true

       // or maybe user canceled:
       subscription.status === 'canceled'; // true
     });
     ```

- send a **subscription renewal** request to the paying service provider.

  ```ts
  // if subscription needs to be renewal, and the subscription is still active:
  let transactionToBeRenewed = await paying.getSubscription(lastSubscriptionId);

  transactionToBeRenewed.expiresAt; // 2022-5-1 00:00:00 (expiresAt is a timestamp, here formatted to a date for ease of reading)

  await paying.checkSubscriptionRenewal('self-hosted', error => {
    // handle error here
  });

  await subscription.refresh();

  subscription.expiresAt; // 2022-6-1 00:00:00
  ```

- **cancel a subscription**

  > subscription can be cancelled by two ways, either by our program or by the user cancelled at paying service provider.

  1. Cancel subscription programmatically

     ```ts
     await paying.cancelSubscription('alipay', subscription); // true;
     ```

  2. subscription canceled by paying service provider

     ```ts
     await paying.handleCallback('alipay', data);
     ```

# Service implementation

## Apple

### Configurations

```ts
interface AppleConfig {
  sharedSecret: string;
}

export interface AppleProduct {
  id: ProductId;
  group?: string;
  // duration milliseconds, only for subscription products
  duration?: number;
}
```

### Initialization

```ts
new AppleService(config, products);
```

## Alipay

### Configurations

more details https://www.yuque.com/chenqiu/alipay-node-sdk/config-sdk

```ts
interface AlipayConfig {
  /**
   * callback urls which will be called by the paying service provider.
   */
  signedCallbackURL: string;
  paidCallbackURL: string;

  gateway?: string;
  appId: string;
  privateKey: string;

  appCert: string;
  alipayPublicCert: string;
  alipayRootCert: string;
}

interface AlipayPurchaseProduct {
  id: ProductId;
  group?: string;

  subject: string;
  amount: number;
}

interface AlipaySubscriptionProduct {
  id: ProductId;
  group?: string;

  subject: string;
  amount: number;
  maxAmount?: number;

  unit: 'MONTH' | 'DAY';
  /**
   * based on unit.
   *
   *
   */
  duration: number;
}
```

### Initialization

```ts
new Alipay(config, products);
```

# API Reference

## Paying()

### Methods

- [user](README.md#user)
- [getSubscription](README.md#getsubscription)
- [getTransaction](README.md#gettransaction)

- [preparePurchase](README.md#preparepurchase)
- [prepareSubscription](README.md#preparesubscription)
- [handleCallback](README.md#handlecallback)

- [checkTransactions](README.md#checktransactions)
- [checkSubscriptionRenewal](README.md#checksubscriptionrenewal)

- [checkTransaction](README.md#checktransaction)
- [cancelSubscription](README.md#cancelsubscription)
- [checkUncompletedSubscription](README.md#checkuncompletedsubscription)

---

### user

▸ **user**(`id`): `Promise`<`User`\>

query user by id from repository,
including all subscriptions and transactions

#### Parameters

| Name | Type                                                                                    | Description |
| :--- | :-------------------------------------------------------------------------------------- | :---------- |
| `id` | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: `true` }\>\> | user ID     |

#### Returns

`Promise`<`User`\>

---

### prepareSubscription

▸ **prepareSubscription**(`serviceName`, `options`): `Promise`<{ `response`: `unknown` ; `subscription`: `Subscription` }\>

prepare a new subscription.
which will create a pending subscription,
and wait to be confirmed by callback or scheduled checks

#### Parameters

| Name          | Type                         | Description                                                 |
| :------------ | :--------------------------- | :---------------------------------------------------------- |
| `serviceName` | `TServiceKey`                | Specify a service to process. refers to keys(this.services) |
| `options`     | `PrepareSubscriptionOptions` |                                                             |

#### Returns

`Promise`<{ `response`: `unknown` ; `subscription`: `Subscription` }\>

> }
> returns a promise that resolves to the subscription created just now and
> response usually send to client to purchase.

#### Defined in

[paying.ts:107](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L107)

---

### preparePurchase

▸ **preparePurchase**(`serviceName`, `productId`, `userId`): `Promise`<`any`\>

Similar to prepareSubscription, but it will create a new pending purchase

#### Parameters

| Name          | Type                                                                                    |
| :------------ | :-------------------------------------------------------------------------------------- |
| `serviceName` | `TServiceKey`                                                                           |
| `product`     | `ProductId`                                                                             |
| `userId`      | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: `true` }\>\> |

#### Returns

`Promise`<`any`\>

#### Defined in

[paying.ts:170](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L170)

---

### cancelSubscription

▸ **cancelSubscription**(`serviceName`, `subscriptionOrId`): `Promise`<`boolean`\>

Try to cancel a subscription. it will send an cancellation request to
payment server, and the payment well be cancelled only if payment server
returns success

#### Parameters

| Name               | Type                                      |
| :----------------- | :---------------------------------------- |
| `serviceName`      | `TServiceKey`                             |
| `subscriptionOrId` | `Subscription` \| `OriginalTransactionId` |

#### Returns

`Promise`<`boolean`\>

#### Defined in

[paying.ts:278](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L278)

---

### checkSubscriptionRenewal

▸ **checkSubscriptionRenewal**(`serviceName`, `onError?`): `Promise`<`void`\>

according to config.renewalBefore.
send a renew request for subscriptions
which expires date less than (now + config.renewalBefore)

#### Parameters

| Name          | Type                           |
| :------------ | :----------------------------- |
| `serviceName` | `TServiceKey`                  |
| `onError?`    | (`error`: `unknown`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:408](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L408)

---

### checkTransaction

▸ **checkTransaction**(`serviceName`, `id`): `Promise`<`void`\>

#### Parameters

| Name          | Type            |
| :------------ | :-------------- |
| `serviceName` | `TServiceKey`   |
| `id`          | `TransactionId` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:442](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L442)

---

### checkTransactions

▸ **checkTransactions**(`serviceName`, `onError?`): `Promise`<`void`\>

call this method periodically. to confirm pending transaction or cancel
expired transaction.

#### Parameters

| Name          | Type                           |
| :------------ | :----------------------------- |
| `serviceName` | `TServiceKey`                  |
| `onError?`    | (`error`: `unknown`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:322](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L322)

---

### checkUncompletedSubscription

▸ **checkUncompletedSubscription**(`serviceName`, `onError?`): `Promise`<`void`\>

check all pending subscriptions.
complete or cancel them if status has been settled.

#### Parameters

| Name          | Type                           |
| :------------ | :----------------------------- |
| `serviceName` | `TServiceKey`                  |
| `onError?`    | (`error`: `unknown`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:357](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L357)

---

### getSubscription

▸ **getSubscription**(`serviceName`, `id`): `Promise`<`undefined` \| `Subscription`\>

Query subscription by id. it also contains all transactions related to
subscription

#### Parameters

| Name          | Type                    |
| :------------ | :---------------------- |
| `serviceName` | `TServiceKey`           |
| `id`          | `OriginalTransactionId` |

#### Returns

`Promise`<`undefined` \| `Subscription`\>

#### Defined in

[paying.ts:154](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L154)

---

### getTransaction

▸ **getTransaction**(`serviceName`, `id`): `Promise`<`undefined` \| `AbstractTransaction`\>

Query transaction by id

#### Parameters

| Name          | Type            | Description    |
| :------------ | :-------------- | :------------- |
| `serviceName` | `TServiceKey`   |                |
| `id`          | `TransactionId` | transaction id |

#### Returns

`Promise`<`undefined` \| `AbstractTransaction`\>

could be SubscriptionTransaction Or PurchaseTransaction

#### Defined in

[paying.ts:138](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L138)

---

### handleCallback

▸ **handleCallback**(`serviceName`, `data`): `Promise`<`void`\>

Handle callback from payment service. which may contains actions like:

- payment-confirmed
- subscribed
- recharge-failed
- ...
  check {Actions} for more details

#### Parameters

| Name          | Type          |
| :------------ | :------------ |
| `serviceName` | `TServiceKey` |
| `data`        | `unknown`     |

#### Returns

`Promise`<`void`\>

void

#### Defined in

[paying.ts:227](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L227)

---

### handleReceipt

▸ **handleReceipt**(`serviceName`, `userId`, `receipt`): `Promise`<`void`\>

Handle receipt from client. send receipt to validation server to validate
and retrieve subscription/purchase status.

#### Parameters

| Name          | Type                                                                                    |
| :------------ | :-------------------------------------------------------------------------------------- |
| `serviceName` | `TServiceKey`                                                                           |
| `userId`      | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: `true` }\>\> |
| `receipt`     | `unknown`                                                                               |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:248](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L248)

# License

MIT License.
