# enverse-pay

Just another awesome magic.

## License

MIT License.

## 使用

```typescript
// 创建 store
let alipayStore = new Store(
  new AlipayAdapter({
    appId: 'app-id',
    privateKey: 'xxx',
    publicKey: 'yyy',
    callbackURL: 'https://example.com/callback',
  }),
  {purchaseExpires: 3000},
);

let appleStore = new Store(AppleAdapter, {
  appId: 'app-id',
  privateKey: 'xxx',
});
```

## 支付宝订阅

1. 创建或更新订阅, 当 product.group 和用户当前订阅的 group 相同时, 会更新订阅

```typescript
let {subscription, payload} = alipayStore.createOrUpdateSubscription({
  product,
  user,
});
// subscription.status === 'pending'
```

2. 返回 payload 给客户端，调起支付宝付款
3. 支付宝回调, 更新订阅状态，或是已经被定时任务更新了

```typescript
let subscription = alipayStore.handleNotification(data);
// subscription.status === 'active' || subscription.status === 'canceled'
// subscription.expiresAt === "2020-01-01T00:00:00.000Z"
```

4. 取消订阅

```typescript
store.cancelSubscription(subscription);
```

## 支付宝购买

1. 购买

```typescript
let {transaction, payload} = alipayStore.createPurchase(product);
```

2. 返回 payload 给客户端，调起支付宝付款

3. 退款

```typescript
alipayStore.refoundPurchase(transaction);
```

## 苹果订阅

1. 通过 receipt 创建或更新订阅

```typescript
let subscription = appleStore.validateAndSaveReceipt(receipt);
```

2. 当订阅信息更新时的回调处理

```typescript
let subscription = appleStore.handleNotification(data);
```

## 苹果付款

```typescript
let transaction = appleStore.validateAndSaveReceipt(receipt);
```

## 定时任务

定期检查过期订阅，以及订阅扣费

```typescript
store.checkSubscriptions(10);
```

定期检查未完成的过期付款

```typescript
store.checkTransactions(20);
```

## 查询

```typescript
let subscription = store.getSubscription(subscriptionId);
// subscription.transactions: Transaction[]
// subscription.expiresAt: "2020-01-01T00:00:00.000Z"
// subscription.status: "active" || "canceled" || 'pending'

let transaction = store.getTransaction(transactionId);
// transaction.status: "pending" || "completed" || "failed"

let subscriptions = store.getSubscriptionByUserId(userId);

let transactions = store.getTransactionsByUserId(userId);
```
