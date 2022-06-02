import Router from '@koa/router';
import {AlipayService} from '@paying/alipay';
import {AppleService} from '@paying/apple';
import type {UserId} from '@paying/core';
import {Paying} from '@paying/core';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import ms from 'ms';

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const config = require('../../.config.js');

const {alipay: ALIPAY_CONFIG, apple: APPLE_CONFIG} = config;

let app = new Koa();
app.use(bodyParser());

let router = new Router();
let paying = new Paying(
  {
    alipay: new AlipayService(
      {
        appId: ALIPAY_CONFIG.appId,
        signedCallbackURL: '',
        paidCallbackURL: '',
        privateKey: ALIPAY_CONFIG.privateKey,
        appCert: ALIPAY_CONFIG.appCert,
        alipayPublicCert: ALIPAY_CONFIG.alipayPublicCert,
        alipayRootCert: ALIPAY_CONFIG.alipayRootCert,
      },
      [],
    ),
    apple: new AppleService({sharedSecret: APPLE_CONFIG.sharedSecret}, []),
  },
  {
    purchaseExpiresAfter: ms('10m'),
    renewalBefore: ms('5d'),
    repository: {
      url: 'mongodb://localhost:27017',
      database: 'paying-demo',
    },
  },
);

const USER_ID = 'xiaoming' as UserId;

router.post('/apple/validate-receipts', async context => {
  if (typeof context.request.body !== 'string') {
    return;
  }

  await paying.handleReceipt('apple', USER_ID, context.request.body);
});

router.post('/alipay/create-order', async context => {
  let {productId} = context.request.body;

  await paying.prepareSubscription('alipay', {productId, userId: USER_ID});
});

app.use(router.routes());

app.listen(80);
