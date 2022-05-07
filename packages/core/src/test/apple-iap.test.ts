import {assertScriptsCompleted, call, createBlackObject, x} from 'black-object';

import type {IPayingDB, IPayingService} from '../library';
import {Paying} from '../library';

const receipt = {
  receipt_type: 'ProductionSandbox',
  adam_id: 0,
  app_item_id: 0,
  bundle_id: 'com.belive.app.ios',
  application_version: '3',
  download_id: 0,
  version_external_identifier: 0,
  receipt_creation_date: '2018-11-13 16:46:31 Etc/GMT',
  receipt_creation_date_ms: '1542127591000',
  receipt_creation_date_pst: '2018-11-13 08:46:31 America/Los_Angeles',
  request_date: '2018-11-13 17:10:31 Etc/GMT',
  request_date_ms: '1542129031280',
  request_date_pst: '2018-11-13 09:10:31 America/Los_Angeles',
  original_purchase_date: '2013-08-01 07:00:00 Etc/GMT',
  original_purchase_date_ms: '1375340400000',
  original_purchase_date_pst: '2013-08-01 00:00:00 America/Los_Angeles',
  original_application_version: '1.0',
  in_app: [
    {
      quantity: '1',
      product_id: 'test2',
      transaction_id: '1000000472106082',
      original_transaction_id: '1000000472106082',
      purchase_date: '2018-11-13 16:46:31 Etc/GMT',
      purchase_date_ms: '1542127591000',
      purchase_date_pst: '2018-11-13 08:46:31 America/Los_Angeles',
      original_purchase_date: '2018-11-13 16:46:31 Etc/GMT',
      original_purchase_date_ms: '1542127591000',
      original_purchase_date_pst: '2018-11-13 08:46:31 America/Los_Angeles',
      is_trial_period: 'false',
    },
  ],
};

test('should handle Apple IAP receipt', async () => {
  let b64Input!: string;
  let userId = '123';

  const extend = (): void => {};

  const appleIAPService = createBlackObject<IPayingService>([
    ['resolveReceipt', call([b64Input], receipt)],
    [
      'prepareSubscription',
      call([
        {
          name: 'premium',
          extend,
        },
      ]),
    ],
    ['submitSubscription', call([])],
  ]);

  const payingDB = createBlackObject<IPayingDB>([
    ['updateSubscription', call([userId, {}])],
  ]);

  const paying = new Paying({
    db: payingDB,
    services: {
      'apple-iap': appleIAPService,
    },
  });

  const user = paying.user('<user-id>');

  await user.handleReceipt('apple-iap', b64Input);

  assertScriptsCompleted(appleIAPService);
  assertScriptsCompleted(payingDB);
});

test('should handle Apple IAP receipt', async () => {
  let b64Input!: string;
  let userId = '123';

  const payingDB = createBlackObject<IPayingDB>([
    ['getSubscriptions', call([userId, {}], [])],
  ]);

  const paying = new Paying({
    db: payingDB,
    services: {},
  });

  const user = paying.user('<user-id>');

  const subscriptions = await user.getSubscriptions();

  expect(subscriptions).toEqual([]);

  assertScriptsCompleted(payingDB);
});

// 回调种类：
// - 订阅更新
// - 续订
// - 已退订

test('should handle Apple IAP subscription change', async () => {
  let b64Input!: string;
  let userId = '123';

  const payingDB = createBlackObject<IPayingDB>([
    ['getSubscriptions', call([userId, {}], [])],
  ]);

  const paying = new Paying({}, payingDB);

  // const user = paying.user('<user-id>');

  paying;

  const subscriptions = await user.getSubscriptions();

  expect(subscriptions).toEqual([]);

  assertScriptsCompleted(payingDB);
});

test('should handle Alipay subscrpition', async () => {
  let userId = '123';

  const alipayService = createBlackObject<IPayingService>([
    ['resolveReceipt', call([b64Input], receipt)],
  ]);

  const payingDB = createBlackObject<IPayingDB>([
    ['updateSubscription', call([userId, {}])],
  ]);

  const paying = new Paying({
    db: payingDB,
    services: {
      alipay: alipayService,
    },
  });

  const user = paying.user('<user-id>');

  let subscription = await user.prepareSubscription('alipay', {});

  await subscription.submit();

  assertScriptsCompleted(alipayService);
  assertScriptsCompleted(payingDB);
});
