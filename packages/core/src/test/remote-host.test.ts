import {assertScriptsCompleted, call, createBlackObject} from 'black-object';
import {MongoClient} from 'mongodb';
import {MongoMemoryServer} from 'mongodb-memory-server';
import ms from 'ms';
import {v4 as uuid} from 'uuid';

import type {
  IPayingService,
  IProduct,
  OriginalTransactionId,
  ProductId,
  Timestamp,
  TransactionId,
  UserId,
} from '../library';
import {Paying} from '../library';

let GROUP_PRODUCTS: Record<
  'monthly' | 'yearly',
  Required<IProduct> & {duration: number}
> = {
  monthly: {
    group: 'membership-2',
    id: 'monthly-2' as ProductId,
    duration: ms('1m'),
    type: 'subscription',
  },
  yearly: {
    group: 'membership-2',
    id: 'yearly-2' as ProductId,
    duration: ms('1y'),
    type: 'subscription',
  },
};

let PURCHASE_PRODUCTS: IProduct[] = [
  {
    id: 'purchase-1' as ProductId,
    type: 'purchase',
  },
  {
    id: 'purchase-2' as ProductId,
    type: 'purchase',
  },
];

// let mongoClient = new MongoClient('mongodb://localhost:27017', {
//   ignoreUndefined: true,
// });
const dbName = 'paying-test-2';

beforeEach(async () => {
  await mongoClient.db(dbName).dropDatabase();
});

let mongoClient: MongoClient;
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  mongoClient = await MongoClient.connect(mongoServer.getUri(), {
    ignoreUndefined: true,
  });

  await mongoClient.connect();
  await mongoClient.db(dbName).dropDatabase();
});

afterAll(async () => {
  await mongoClient.close();

  if (mongoServer) {
    await mongoServer.stop();
  }
});

function generateTransactionId(): TransactionId {
  return uuid() as TransactionId;
}

function generateOriginalTransactionId(): OriginalTransactionId {
  return uuid() as OriginalTransactionId;
}

test('should sync receipt', async () => {
  let duration = ms('30d');
  let subscriptionTransactionId = generateTransactionId();
  let originalTransactionId = generateOriginalTransactionId();
  let purchaseId1 = generateTransactionId();
  let purchaseId2 = generateTransactionId();
  let purchasedAt = (Date.now() - ms('5h')) as Timestamp;

  let remoteHostedService = createBlackObject<IPayingService>([
    [
      'parseReceipt',
      call(
        [],
        Promise.resolve({
          subscription: {
            originalTransactionId,
            transactionId: subscriptionTransactionId,
            purchasedAt,
            expiresAt: (purchasedAt + duration) as Timestamp,
            subscribedAt: purchasedAt,
            product: GROUP_PRODUCTS.monthly,
            autoRenewal: true,
            autoRenewalProduct: GROUP_PRODUCTS.yearly,
          },
          purchase: [
            {
              quantity: 1,
              product: PURCHASE_PRODUCTS[0],
              transactionId: purchaseId1,
              purchasedAt,
            },
            {
              quantity: 1,
              product: PURCHASE_PRODUCTS[1],
              transactionId: purchaseId2,
              purchasedAt,
            },
          ],
        }),
      ),
    ],
    // 幂等测试
    [
      'parseReceipt',
      call(
        [],
        Promise.resolve({
          subscription: {
            originalTransactionId,
            transactionId: subscriptionTransactionId,
            purchasedAt,
            expiresAt: (purchasedAt + duration) as Timestamp,
            subscribedAt: purchasedAt,
            product: GROUP_PRODUCTS.monthly,
            autoRenewal: true,
            autoRenewalProduct: GROUP_PRODUCTS.yearly,
          },
          purchase: [
            {
              quantity: 1,
              product: PURCHASE_PRODUCTS[0],
              transactionId: purchaseId1,
              purchasedAt,
            },
            {
              quantity: 1,
              product: PURCHASE_PRODUCTS[1],
              transactionId: purchaseId2,
              purchasedAt,
            },
          ],
        }),
      ),
    ],
    [
      'parseCallback',
      call(
        [],
        Promise.resolve({
          type: 'change-renewal-status' as 'change-renewal-status',
          originalTransactionId,
          renewalEnabled: false,
        }),
      ),
    ],
    [
      'parseCallback',
      call(
        [],
        Promise.resolve({
          type: 'change-renewal-info' as 'change-renewal-info',
          originalTransactionId,
          renewalEnabled: true,
          autoRenewProductId: GROUP_PRODUCTS.yearly.id,
          productId: GROUP_PRODUCTS.monthly.id,
        }),
      ),
    ],
  ]);

  const paying = new Paying(
    {'remote-hosted': remoteHostedService},
    {
      purchaseExpiresAfter: ms('10m'),
      renewalBefore: ms('5d'),
      repository: {
        mongoClient,
        database: dbName,
      },
    },
  );

  await paying.ready;

  let userId = 'xiaohong' as UserId;

  // handle receipts first
  await paying.handleReceipt('remote-hosted', userId, '');

  let user = await paying.user(userId);

  expect(user.getExpireTime(GROUP_PRODUCTS.monthly.group)).toBe(
    purchasedAt + duration,
  );

  expect(user.purchaseTransactions.length).toBe(2);

  // handle duplicated receipts second
  await paying.handleReceipt('remote-hosted', userId, '');

  let user2 = await paying.user(userId);

  expect(user2.getExpireTime(GROUP_PRODUCTS.monthly.group)).toBe(
    purchasedAt + duration,
  );

  expect(user2.purchaseTransactions.length).toBe(2);

  expect(user2.subscriptions[0].renewalEnabled).toBe(true);

  // handle change renewal status

  await paying.handleCallback('remote-hosted', {});

  let user3 = await paying.user(userId);

  expect(user3.subscriptions[0].renewalEnabled).toBe(false);

  // handle change renewal info

  await paying.handleCallback('remote-hosted', {});

  let user4 = await paying.user(userId);

  expect(user4.subscriptions[0].renewalEnabled).toBe(true);
  expect(user4.subscriptions[0].originalTransaction.renewalProduct).toBe(
    GROUP_PRODUCTS.yearly.id,
  );

  assertScriptsCompleted(remoteHostedService);
});
