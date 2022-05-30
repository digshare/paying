import {
  assertScriptsCompleted,
  call,
  createBlackObject,
  get,
  x,
} from 'black-object';
import type {Collection, FindCursor} from 'mongodb';
import ms from 'ms';

import type {
  IPayingService,
  IProduct,
  IRepository,
  OriginalTransactionDocument,
  OriginalTransactionId,
  SubscriptionTransactionDocument,
  TransactionId,
} from '../library';
import {
  Paying,
  ProductId,
  Subscription,
  SubscriptionTransaction,
  Timestamp,
  UserId,
} from '../library';

import {generateOriginalTransactionId, generateTransactionId} from './@common';

const GROUP_PRODUCTS: Record<
  'monthly' | 'yearly',
  Required<IProduct> & {duration: number}
> = {
  monthly: {
    group: 'membership',
    id: 'monthly' as ProductId,
    duration: ms('30d'),
    type: 'subscription',
  },
  yearly: {
    group: 'membership',
    id: 'yearly' as ProductId,
    duration: ms('1y'),
    type: 'subscription',
  },
};

const PURCHASE_EXPIRES_AFTER = ms('10m');
const RENEW_BEFORE = ms('5d');
const XIAO_MING = 'xiaoming' as UserId;
const SERVICE_NAME = 'self-host-unit-testing';

test('should prepare subscription', async () => {
  let transactionId = generateTransactionId();
  let originalTransactionId = generateOriginalTransactionId();
  let now = new Date().getTime() as Timestamp;
  let product = GROUP_PRODUCTS.monthly;

  let originalTransaction: OriginalTransactionDocument = {
    _id: originalTransactionId,
    product: product.id,
    renewalProduct: product.id,
    productGroup: product.group,
    startsAt: undefined,
    createdAt: now,
    expiresAt: undefined,
    subscribedAt: undefined,
    canceledAt: undefined,
    cancelReason: undefined,
    renewalEnabled: false,
    lastFailedReason: undefined,
    user: XIAO_MING,
    service: SERVICE_NAME,
    serviceExtra: undefined,
  };

  let transactionDoc: SubscriptionTransactionDocument = {
    _id: transactionId,
    originalTransactionId,
    startsAt: now,
    duration: product.duration,
    product: product.id,
    productGroup: product.group,
    user: XIAO_MING,
    createdAt: now,
    purchasedAt: undefined,
    completedAt: undefined,
    canceledAt: undefined,
    cancelReason: undefined,
    paymentExpiresAt: undefined,
    failedAt: undefined,
    service: SERVICE_NAME,
    type: 'subscription',
    raw: undefined,
  };

  let repository: IRepository;

  repository = createBlackObject<IRepository>([
    ['ready', get(Promise.resolve())],
    [
      'getActiveSubscriptionTransactionsByUserIdInGroup',
      call([XIAO_MING, 'membership'], Promise.resolve(undefined)),
    ],
    [
      'createOriginalTransaction',
      call(
        [Object.assign(originalTransaction, {createdAt: Timestamp})],
        async (doc: OriginalTransactionDocument) => {
          originalTransaction.createdAt = doc.createdAt;
        },
      ),
    ],
    [
      'createTransaction',
      call(
        [
          Object.assign(transactionDoc, {
            createdAt: Timestamp,
            startsAt: Timestamp,
          }),
        ],
        async (doc: SubscriptionTransactionDocument) => {
          transactionDoc.createdAt = doc.createdAt;
          transactionDoc.startsAt = doc.startsAt;
        },
      ),
    ],
    [
      'getSubscriptionById',
      call(
        ['self-host-unit-testing', originalTransactionId],
        new Promise<Subscription>(resolve => {
          resolve(
            new Subscription(
              originalTransaction,
              [new SubscriptionTransaction(transactionDoc)],
              repository,
            ),
          );
        }),
      ),
    ],
  ]);

  let service = createBlackObject<IPayingService>([
    [
      'prepareSubscriptionData',
      call(
        [
          x.object({
            startsAt: Timestamp,
            product: x.object({
              id: ProductId,
              group: x.union(x.string, x.undefined),
              type: x.union(x.literal('subscription'), x.literal('purchase')),
            }),
            paymentExpiresAt: Timestamp,
            userId: UserId,
          }),
        ],
        Promise.resolve({
          response: '',
          duration: product.duration,
          transactionId,
          originalTransactionId,
        }),
      ),
    ],
  ]);

  let paying = new Paying(
    {
      [SERVICE_NAME]: service,
    },
    {
      purchaseExpiresAfter: PURCHASE_EXPIRES_AFTER,
      renewalBefore: RENEW_BEFORE,
      repository,
    },
  );

  let {subscription} = await paying.prepareSubscription(SERVICE_NAME, {
    product: GROUP_PRODUCTS.monthly,
    userId: XIAO_MING,
  });

  expect(subscription.originalTransaction).toEqual(originalTransaction);

  assertScriptsCompleted(service);
  assertScriptsCompleted(repository);
});

test('should confirm subscription', async () => {
  let transactionId = generateTransactionId();
  let originalTransactionId = generateOriginalTransactionId();
  let subscriptionCreatedAt = (new Date().getTime() - ms('8min')) as Timestamp;
  let purchasedAt = new Date().getTime() as Timestamp;
  let product = GROUP_PRODUCTS.monthly;

  let originalTransaction: OriginalTransactionDocument = {
    _id: originalTransactionId,
    product: product.id,
    renewalProduct: product.id,
    productGroup: product.group,
    startsAt: undefined,
    createdAt: subscriptionCreatedAt,
    expiresAt: undefined,
    subscribedAt: undefined,
    canceledAt: undefined,
    cancelReason: undefined,
    renewalEnabled: false,
    lastFailedReason: undefined,
    user: XIAO_MING,
    service: SERVICE_NAME,
    serviceExtra: undefined,
  };

  let transactionDoc: SubscriptionTransactionDocument = {
    _id: transactionId,
    originalTransactionId,
    startsAt: subscriptionCreatedAt,
    duration: product.duration,
    product: product.id,
    productGroup: product.group,
    user: XIAO_MING,
    createdAt: subscriptionCreatedAt,
    purchasedAt: undefined,
    completedAt: undefined,
    canceledAt: undefined,
    cancelReason: undefined,
    paymentExpiresAt: (subscriptionCreatedAt +
      PURCHASE_EXPIRES_AFTER) as Timestamp,
    failedAt: undefined,
    service: SERVICE_NAME,
    type: 'subscription',
    raw: undefined,
  };

  let repository: IRepository;

  repository = createBlackObject<IRepository>([
    ['ready', get(Promise.resolve())],
    [
      'getTransactionById',
      call([SERVICE_NAME, transactionId], Promise.resolve(transactionDoc)),
    ],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [
                x.object({
                  _id: x.string,
                }),
              ],
              async ({_id}: {_id: TransactionId}, {$set}: {$set: object}) => {
                expect(_id).toEqual(transactionId);

                Object.assign(transactionDoc, $set);
              },
            ),
          ],
        ]);
      }),
    ],
    [
      'getOriginalTransactionById',
      call(
        [SERVICE_NAME, originalTransactionId],
        Promise.resolve(originalTransaction),
      ),
    ],
    [
      'collectionOfType',
      call(['original-transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [x.object({})],
              async (
                {_id}: {_id: OriginalTransactionId},
                {$set}: {$set: object},
              ) => {
                expect(_id).toEqual(originalTransactionId);

                Object.assign(originalTransaction, $set);
              },
            ),
          ],
        ]);
      }),
    ],
  ]);

  let service = createBlackObject<IPayingService>([
    [
      'parseCallback',
      call(
        [x.object({})],
        Promise.resolve({
          type: 'payment-confirmed' as 'payment-confirmed',
          transactionId,
          purchasedAt,
        }),
      ),
    ],
  ]);

  let paying = new Paying(
    {
      [SERVICE_NAME]: service,
    },
    {
      purchaseExpiresAfter: PURCHASE_EXPIRES_AFTER,
      renewalBefore: RENEW_BEFORE,
      repository,
    },
  );

  await paying.handleCallback(SERVICE_NAME, {});

  let subscription = new Subscription(
    originalTransaction,
    [new SubscriptionTransaction(transactionDoc)],
    repository,
  );

  expect(subscription.status).toEqual('active');

  assertScriptsCompleted(service);
  assertScriptsCompleted(repository);
});

test('should renewal subscription', async () => {
  let transactionId = generateTransactionId();
  let originalTransactionId = generateOriginalTransactionId();
  let now = new Date().getTime();
  let subscriptionCreatedAt = (now - ms('28d')) as Timestamp;
  let purchasedAt = subscriptionCreatedAt;
  let expiresAt = (now + ms('2d')) as Timestamp;
  let product = GROUP_PRODUCTS.monthly;
  let adventDate = (now + RENEW_BEFORE) as Timestamp;

  let originalTransaction: OriginalTransactionDocument = {
    _id: originalTransactionId,
    product: product.id,
    renewalProduct: product.id,
    productGroup: product.group,
    startsAt: purchasedAt,
    createdAt: subscriptionCreatedAt,
    expiresAt,
    subscribedAt: purchasedAt,
    canceledAt: undefined,
    cancelReason: undefined,
    renewalEnabled: true,
    lastFailedReason: undefined,
    user: XIAO_MING,
    service: SERVICE_NAME,
    serviceExtra: undefined,
  };

  let transactionDoc: SubscriptionTransactionDocument = {
    _id: transactionId,
    originalTransactionId,
    startsAt: subscriptionCreatedAt,
    duration: product.duration,
    product: product.id,
    productGroup: product.group,
    user: XIAO_MING,
    createdAt: subscriptionCreatedAt,
    purchasedAt,
    completedAt: purchasedAt,
    canceledAt: undefined,
    cancelReason: undefined,
    paymentExpiresAt: (subscriptionCreatedAt +
      PURCHASE_EXPIRES_AFTER) as Timestamp,
    failedAt: undefined,
    service: SERVICE_NAME,
    type: 'subscription',
    raw: undefined,
  };

  let newTransaction: SubscriptionTransactionDocument | undefined;

  let repository: IRepository;

  repository = createBlackObject<IRepository>([
    ['ready', get(Promise.resolve())],
    [
      'collectionOfType',
      call(['original-transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'find',
            call(
              [
                {
                  expiresAt: {$lt: x.number},
                  canceledAt: {$exists: false},
                  subscribedAt: {$exists: true},
                  service: SERVICE_NAME,
                },
              ] as any,
              createBlackObject<FindCursor>([
                [
                  'hasNext',
                  call([], async () => {
                    return true;
                  }),
                ],
                ['next', call([], Promise.resolve([originalTransaction]))],
                [
                  'hasNext',
                  call([], async () => {
                    return false;
                  }),
                ],
              ]),
            ),
          ],
        ]);
      }),
    ],
    [
      'requireOriginalTransaction',
      call(
        [SERVICE_NAME, originalTransactionId],
        Promise.resolve(originalTransaction),
      ),
    ],
    [
      'getTransactionById',
      call([SERVICE_NAME, transactionId], Promise.resolve(undefined)),
    ],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'insertOne',
            call(
              [x.object({})],
              async (doc: SubscriptionTransactionDocument): Promise<any> => {
                newTransaction = doc;
              },
            ),
          ],
        ]);
      }),
    ],
    [
      'getTransactionById',
      call([SERVICE_NAME, transactionId], async () => newTransaction),
    ],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [
                x.object({
                  _id: x.string,
                }),
              ],
              async ({_id}: {_id: TransactionId}, {$set}: {$set: object}) => {
                expect(_id).toEqual(transactionId);

                Object.assign(transactionDoc, $set);
              },
            ),
          ],
        ]);
      }),
    ],
    [
      'getOriginalTransactionById',
      call(
        [SERVICE_NAME, originalTransactionId],
        Promise.resolve(originalTransaction),
      ),
    ],
    [
      'collectionOfType',
      call(['original-transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [x.object({})],
              async (
                {_id}: {_id: OriginalTransactionId},
                {$set}: {$set: object},
              ) => {
                expect(_id).toEqual(originalTransactionId);

                Object.assign(originalTransaction, $set);
              },
            ),
          ],
        ]);
      }),
    ],
  ]);

  let service = createBlackObject<IPayingService>([
    [
      'rechargeSubscription',
      call(
        [x.object({})],
        Promise.resolve({
          type: 'subscription-renewal' as 'subscription-renewal',
          transactionId,
          purchasedAt,
          duration: product.duration,
          originalTransactionId,
          product,
        }),
      ),
    ],
  ]);

  let paying = new Paying(
    {
      [SERVICE_NAME]: service,
    },
    {
      purchaseExpiresAfter: PURCHASE_EXPIRES_AFTER,
      renewalBefore: RENEW_BEFORE,
      repository,
    },
  );

  await paying.checkSubscriptionRenewal(SERVICE_NAME, error => {
    console.error(error);
  });

  let subscription = new Subscription(
    originalTransaction,
    [new SubscriptionTransaction(transactionDoc)],
    repository,
  );

  expect(subscription.status).toEqual('active');
  expect(subscription.expiresAt).toEqual(expiresAt + product.duration);

  assertScriptsCompleted(service);
  assertScriptsCompleted(repository);
});

test('should cancel expired transaction', async () => {
  let transactionId = generateTransactionId();
  let originalTransactionId = generateOriginalTransactionId();
  let now = new Date().getTime() as Timestamp;
  let subscriptionCreatedAt = (now - ms('28d')) as Timestamp;
  let product = GROUP_PRODUCTS.monthly;

  let transactionDoc: SubscriptionTransactionDocument = {
    _id: transactionId,
    originalTransactionId,
    startsAt: subscriptionCreatedAt,
    duration: product.duration,
    product: product.id,
    productGroup: product.group,
    user: XIAO_MING,
    createdAt: subscriptionCreatedAt,
    purchasedAt: undefined,
    completedAt: undefined,
    canceledAt: undefined,
    cancelReason: undefined,
    paymentExpiresAt: (subscriptionCreatedAt +
      PURCHASE_EXPIRES_AFTER) as Timestamp,
    failedAt: undefined,
    service: SERVICE_NAME,
    type: 'subscription',
    raw: undefined,
  };

  let repository: IRepository;

  repository = createBlackObject<IRepository>([
    ['ready', get(Promise.resolve())],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'find',
            call(
              [{}] as any,
              createBlackObject<FindCursor>([
                [
                  'hasNext',
                  call([], async () => {
                    return true;
                  }),
                ],
                ['next', call([], Promise.resolve(transactionDoc))],
                [
                  'hasNext',
                  call([], async () => {
                    return false;
                  }),
                ],
              ]),
            ),
          ],
        ]);
      }),
    ],
    [
      'buildTransactionFromDoc',
      call([transactionDoc], new SubscriptionTransaction(transactionDoc)),
    ],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [x.object({})],
              async ({_id, service}: any, {$set}: any): Promise<any> => {
                expect(_id).toEqual(transactionId);
                expect(service).toEqual(SERVICE_NAME);

                Object.assign(transactionDoc, $set);
              },
            ),
          ],
        ]);
      }),
    ],
  ]);

  let service = createBlackObject<IPayingService>([
    [
      'queryTransactionStatus',
      call(
        [transactionId],
        Promise.resolve({
          type: 'canceled' as 'canceled',
          canceledAt: now,
        }),
      ),
    ],
  ]);

  let paying = new Paying(
    {
      [SERVICE_NAME]: service,
    },
    {
      purchaseExpiresAfter: PURCHASE_EXPIRES_AFTER,
      renewalBefore: RENEW_BEFORE,
      repository,
    },
  );

  await paying.checkTransactions(SERVICE_NAME, error => {
    console.error(error);
  });

  assertScriptsCompleted(service);
  assertScriptsCompleted(repository);

  let transaction = new SubscriptionTransaction(transactionDoc);

  expect(transaction.status).toEqual('canceled');
  expect(transaction.canceledAt).toEqual(now);
});

test('should renew failed', async () => {
  let transactionId = generateTransactionId();
  let originalTransactionId = generateOriginalTransactionId();
  let now = new Date().getTime();
  let subscriptionCreatedAt = (now - ms('28d')) as Timestamp;
  let purchasedAt = subscriptionCreatedAt;
  let expiresAt = (now + ms('2d')) as Timestamp;
  let product = GROUP_PRODUCTS.monthly;

  let originalTransaction: OriginalTransactionDocument = {
    _id: originalTransactionId,
    product: product.id,
    renewalProduct: product.id,
    productGroup: product.group,
    startsAt: purchasedAt,
    createdAt: subscriptionCreatedAt,
    expiresAt,
    subscribedAt: purchasedAt,
    canceledAt: undefined,
    cancelReason: undefined,
    renewalEnabled: true,
    lastFailedReason: undefined,
    user: XIAO_MING,
    service: SERVICE_NAME,
    serviceExtra: undefined,
  };

  let transactionDoc: SubscriptionTransactionDocument = {
    _id: transactionId,
    originalTransactionId,
    startsAt: subscriptionCreatedAt,
    duration: product.duration,
    product: product.id,
    productGroup: product.group,
    user: XIAO_MING,
    createdAt: subscriptionCreatedAt,
    purchasedAt,
    completedAt: purchasedAt,
    canceledAt: undefined,
    cancelReason: undefined,
    paymentExpiresAt: (subscriptionCreatedAt +
      PURCHASE_EXPIRES_AFTER) as Timestamp,
    failedAt: undefined,
    service: SERVICE_NAME,
    type: 'subscription',
    raw: undefined,
  };

  let newTransaction: SubscriptionTransactionDocument | undefined;

  let repository: IRepository;

  repository = createBlackObject<IRepository>([
    ['ready', get(Promise.resolve())],
    [
      'collectionOfType',
      call(['original-transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'find',
            call(
              [{}] as any,
              createBlackObject<FindCursor>([
                [
                  'hasNext',
                  call([], async () => {
                    return true;
                  }),
                ],
                ['next', call([], Promise.resolve([originalTransaction]))],
                [
                  'hasNext',
                  call([], async () => {
                    return false;
                  }),
                ],
              ]),
            ),
          ],
        ]);
      }),
    ],
    [
      'requireOriginalTransaction',
      call(
        [SERVICE_NAME, originalTransactionId],
        Promise.resolve(originalTransaction),
      ),
    ],
    [
      'getTransactionById',
      call([SERVICE_NAME, transactionId], Promise.resolve(undefined)),
    ],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'insertOne',
            call(
              [x.object({})],
              async (doc: SubscriptionTransactionDocument): Promise<any> => {
                newTransaction = doc;
              },
            ),
          ],
        ]);
      }),
    ],
    [
      'getTransactionById',
      call([SERVICE_NAME, transactionId], async () => newTransaction),
    ],
    [
      'collectionOfType',
      call(['transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [
                x.object({
                  _id: x.string,
                }),
              ],
              async ({_id}: {_id: TransactionId}, {$set}: {$set: object}) => {
                expect(_id).toEqual(transactionId);

                Object.assign(transactionDoc, $set);
              },
            ),
          ],
        ]);
      }),
    ],
    [
      'getOriginalTransactionById',
      call(
        [SERVICE_NAME, originalTransactionId],
        Promise.resolve(originalTransaction),
      ),
    ],
    [
      'collectionOfType',
      call(['original-transaction'], (): Collection<any> => {
        return createBlackObject<Collection>([
          [
            'updateOne',
            call(
              [x.object({})],
              async (
                {_id}: {_id: OriginalTransactionId},
                {$set}: {$set: object},
              ) => {
                expect(_id).toEqual(originalTransactionId);

                Object.assign(originalTransaction, $set);
              },
            ),
          ],
        ]);
      }),
    ],
  ]);

  let service = createBlackObject<IPayingService>([
    [
      'rechargeSubscription',
      call(
        [x.object({})],
        Promise.resolve({
          type: 'subscription-renewal' as 'subscription-renewal',
          transactionId,
          purchasedAt,
          duration: product.duration,
          originalTransactionId,
          product,
        }),
      ),
    ],
  ]);

  let paying = new Paying(
    {
      [SERVICE_NAME]: service,
    },
    {
      purchaseExpiresAfter: PURCHASE_EXPIRES_AFTER,
      renewalBefore: RENEW_BEFORE,
      repository,
    },
  );

  await paying.checkSubscriptionRenewal(SERVICE_NAME, error => {
    console.error(error);
  });

  let subscription = new Subscription(
    originalTransaction,
    [new SubscriptionTransaction(transactionDoc)],
    repository,
  );

  expect(subscription.status).toEqual('active');
  expect(subscription.expiresAt).toEqual(expiresAt + product.duration);

  assertScriptsCompleted(service);
  assertScriptsCompleted(repository);
});
