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

## Alipay

# API

WIP

# License

MIT License.
