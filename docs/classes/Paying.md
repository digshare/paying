[@paying/core](../README.md) / [Exports](../modules.md) / Paying

# Class: Paying<TPayingService, TServiceKey\>

## Type parameters

| Name | Type |
| :------ | :------ |
| `TPayingService` | extends `IPayingService` |
| `TServiceKey` | extends `string` |

## Table of contents

### Constructors

- [constructor](Paying.md#constructor)

### Properties

- [actionHandler](Paying.md#actionhandler)
- [config](Paying.md#config)
- [ready](Paying.md#ready)
- [repository](Paying.md#repository)
- [services](Paying.md#services)

### Methods

- [\_checkTransaction](Paying.md#_checktransaction)
- [applyAction](Paying.md#applyaction)
- [cancelSubscription](Paying.md#cancelsubscription)
- [cancelTransaction](Paying.md#canceltransaction)
- [checkSubscriptionRenewal](Paying.md#checksubscriptionrenewal)
- [checkTransaction](Paying.md#checktransaction)
- [checkTransactions](Paying.md#checktransactions)
- [checkUncompletedSubscription](Paying.md#checkuncompletedsubscription)
- [createSubscription](Paying.md#createsubscription)
- [getSubscription](Paying.md#getsubscription)
- [getTransaction](Paying.md#gettransaction)
- [handleCallback](Paying.md#handlecallback)
- [handleChangeRenewalInfo](Paying.md#handlechangerenewalinfo)
- [handleChangeRenewalStatus](Paying.md#handlechangerenewalstatus)
- [handlePaymentConfirmed](Paying.md#handlepaymentconfirmed)
- [handleReceipt](Paying.md#handlereceipt)
- [handleRenewal](Paying.md#handlerenewal)
- [handleSubscribed](Paying.md#handlesubscribed)
- [handleSubscriptionCanceled](Paying.md#handlesubscriptioncanceled)
- [preparePurchase](Paying.md#preparepurchase)
- [prepareSubscription](Paying.md#preparesubscription)
- [rechargeFailed](Paying.md#rechargefailed)
- [requireService](Paying.md#requireservice)
- [syncSubscription](Paying.md#syncsubscription)
- [syncTransaction](Paying.md#synctransaction)
- [user](Paying.md#user)

## Constructors

### constructor

• **new Paying**<`TPayingService`, `TServiceKey`\>(`services`, `config`)

#### Type parameters

| Name | Type |
| :------ | :------ |
| `TPayingService` | extends `IPayingService`<`IProduct`, `TPayingService`\> |
| `TServiceKey` | extends `string` |

#### Parameters

| Name | Type |
| :------ | :------ |
| `services` | `Record`<`TServiceKey`, `IPayingService`<`IProduct`\>\> |
| `config` | `PayingConfig` |

#### Defined in

[paying.ts:69](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L69)

## Properties

### actionHandler

• `Private` **actionHandler**: `ActionToHandler`<`TServiceKey`\>

#### Defined in

[paying.ts:59](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L59)

___

### config

• **config**: `PayingConfig`

___

### ready

• **ready**: `Promise`<`void`\>

#### Defined in

[paying.ts:57](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L57)

___

### repository

• `Private` **repository**: `Repository`

#### Defined in

[paying.ts:56](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L56)

___

### services

• `Readonly` **services**: `Record`<`TServiceKey`, `IPayingService`<`IProduct`\>\>

## Methods

### \_checkTransaction

▸ `Private` **_checkTransaction**(`serviceName`, `transaction`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `transaction` | `AbstractTransaction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:497](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L497)

___

### applyAction

▸ `Private` **applyAction**(`serviceName`, `action`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `action` | `Action` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:451](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L451)

___

### cancelSubscription

▸ **cancelSubscription**(`serviceName`, `subscriptionOrId`): `Promise`<`boolean`\>

Try to cancel a subscription. it will send an cancellation request to
payment server, and the payment well be cancelled only if payment server
returns success

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `subscriptionOrId` | `Subscription` \| `OriginalTransactionId` |

#### Returns

`Promise`<`boolean`\>

#### Defined in

[paying.ts:278](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L278)

___

### cancelTransaction

▸ `Private` **cancelTransaction**(`serviceName`, `transaction`, `canceledAt`, `reason?`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `transaction` | `AbstractTransaction` |
| `canceledAt` | `__RefinedNominalType`<`number`, `Record`<typeof `__nominal`, { `timestamp`: ``true``  }\>\> |
| `reason?` | `any` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:523](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L523)

___

### checkSubscriptionRenewal

▸ **checkSubscriptionRenewal**(`serviceName`, `onError?`): `Promise`<`void`\>

according to config.renewalBefore.
send a renew request for subscriptions
which expires date less than (now + config.renewalBefore)

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `onError?` | (`error`: `unknown`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:408](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L408)

___

### checkTransaction

▸ **checkTransaction**(`serviceName`, `id`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `id` | `TransactionId` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:442](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L442)

___

### checkTransactions

▸ **checkTransactions**(`serviceName`, `onError?`): `Promise`<`void`\>

call this method periodically. to confirm pending transaction or cancel
expired transaction.

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `onError?` | (`error`: `unknown`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:322](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L322)

___

### checkUncompletedSubscription

▸ **checkUncompletedSubscription**(`serviceName`, `onError?`): `Promise`<`void`\>

check all pending subscriptions.
complete or cancel them if status has been settled.

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `onError?` | (`error`: `unknown`) => `void` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:357](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L357)

___

### createSubscription

▸ `Private` **createSubscription**(`serviceName`, `__namedParameters`, `lastSubscription?`): `Promise`<{ `response`: `unknown` ; `subscription`: `Subscription`  }\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `__namedParameters` | `PrepareSubscriptionOptions`<`InferProduct`<`TPayingService`\>\> |
| `lastSubscription?` | `Subscription` |

#### Returns

`Promise`<{ `response`: `unknown` ; `subscription`: `Subscription`  }\>

#### Defined in

[paying.ts:912](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L912)

___

### getSubscription

▸ **getSubscription**(`serviceName`, `id`): `Promise`<`undefined` \| `Subscription`\>

Query subscription by id. it also contains all transactions related to
subscription

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `id` | `OriginalTransactionId` |

#### Returns

`Promise`<`undefined` \| `Subscription`\>

#### Defined in

[paying.ts:154](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L154)

___

### getTransaction

▸ **getTransaction**(`serviceName`, `id`): `Promise`<`undefined` \| `AbstractTransaction`\>

Query transaction by id

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `serviceName` | `TServiceKey` |  |
| `id` | `TransactionId` | transaction id |

#### Returns

`Promise`<`undefined` \| `AbstractTransaction`\>

could be SubscriptionTransaction Or PurchaseTransaction

#### Defined in

[paying.ts:138](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L138)

___

### handleCallback

▸ **handleCallback**(`serviceName`, `data`): `Promise`<`void`\>

Handle callback from payment service. which may contains actions like:
- payment-confirmed
- subscribed
- recharge-failed
- ...
check {Actions} for more details

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `data` | `unknown` |

#### Returns

`Promise`<`void`\>

void

#### Defined in

[paying.ts:227](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L227)

___

### handleChangeRenewalInfo

▸ `Private` **handleChangeRenewalInfo**(`serviceName`, `renewalInfo`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `renewalInfo` | `ChangeRenewalInfoAction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:663](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L663)

___

### handleChangeRenewalStatus

▸ `Private` **handleChangeRenewalStatus**(`serviceName`, `renewalInfo`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `renewalInfo` | `ChangeRenewalStatusAction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:682](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L682)

___

### handlePaymentConfirmed

▸ `Private` **handlePaymentConfirmed**(`serviceName`, `data`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `data` | `PaymentConfirmedAction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:580](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L580)

___

### handleReceipt

▸ **handleReceipt**(`serviceName`, `userId`, `receipt`): `Promise`<`void`\>

Handle receipt from client. send receipt to validation server to validate
and retrieve subscription/purchase status.

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `userId` | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: ``true``  }\>\> |
| `receipt` | `unknown` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:248](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L248)

___

### handleRenewal

▸ `Private` **handleRenewal**(`serviceName`, `info`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `info` | `SubscriptionRenewalAction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:698](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L698)

___

### handleSubscribed

▸ `Private` **handleSubscribed**(`serviceName`, `data`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `data` | `SubscribedAction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:551](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L551)

___

### handleSubscriptionCanceled

▸ `Private` **handleSubscriptionCanceled**(`_serviceName`, `action`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `_serviceName` | `TServiceKey` |
| `action` | `SubscriptionCanceledAction` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:480](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L480)

___

### preparePurchase

▸ **preparePurchase**(`serviceName`, `product`, `userId`): `Promise`<`any`\>

Similar to prepareSubscription, but it will create a new pending purchase

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `product` | `InferProduct`<`TPayingService`\> |
| `userId` | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: ``true``  }\>\> |

#### Returns

`Promise`<`any`\>

#### Defined in

[paying.ts:170](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L170)

___

### prepareSubscription

▸ **prepareSubscription**(`serviceName`, `options`): `Promise`<{ `response`: `unknown` ; `subscription`: `Subscription`  }\>

prepare a new subscription.
which will create a pending subscription,
and wait to be confirmed by callback or scheduled checks

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `serviceName` | `TServiceKey` | Specify a service to process. refers to keys(this.services) |
| `options` | `PrepareSubscriptionOptions`<`InferProduct`<`TPayingService`\>\> |  |

#### Returns

`Promise`<{ `response`: `unknown` ; `subscription`: `Subscription`  }\>

>}
returns a promise that resolves to the subscription created just now and
response usually send to client to purchase.

#### Defined in

[paying.ts:107](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L107)

___

### rechargeFailed

▸ `Private` **rechargeFailed**(`_serviceName`, `action`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `_serviceName` | `TServiceKey` |
| `action` | `RechargeFailed` |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:459](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L459)

___

### requireService

▸ `Private` **requireService**(`serviceName`): `IPayingService`<`IProduct`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |

#### Returns

`IPayingService`<`IProduct`\>

#### Defined in

[paying.ts:755](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L755)

___

### syncSubscription

▸ `Private` **syncSubscription**(`serviceName`, `userId`, `__namedParameters`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `userId` | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: ``true``  }\>\> |
| `__namedParameters` | `SubscriptionReceipt`<`InferProduct`<`TPayingService`\>\> |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:805](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L805)

___

### syncTransaction

▸ `Private` **syncTransaction**(`serviceName`, `userId`, `__namedParameters`): `Promise`<`void`\>

#### Parameters

| Name | Type |
| :------ | :------ |
| `serviceName` | `TServiceKey` |
| `userId` | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: ``true``  }\>\> |
| `__namedParameters` | `PurchaseReceipt`<`InferProduct`<`TPayingService`\>\> |

#### Returns

`Promise`<`void`\>

#### Defined in

[paying.ts:765](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L765)

___

### user

▸ **user**(`id`): `Promise`<`User`\>

query user by id from repository,
including all subscriptions and transactions

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `id` | `__RefinedNominalType`<`string`, `Record`<typeof `__nominal`, { `user-id`: ``true``  }\>\> | user ID |

#### Returns

`Promise`<`User`\>

User Object

#### Defined in

[paying.ts:90](https://github.com/digshare/enverse-pay/blob/81b41de/packages/core/src/library/paying.ts#L90)
