import type {
  Action,
  ApplyingReceipt,
  CancelSubscriptionOptions,
  IProduct,
  OriginalTransactionDocument,
  OriginalTransactionId,
  PayingServiceSubscriptionPrepareOptions,
  PaymentConfirmedAction,
  PrepareSubscriptionReturn,
  PurchaseCreation,
  SubscribedAction,
  SubscriptionStatusCheckingResult,
  Timestamp,
  TransactionId,
  TransactionStatusCheckingResult,
} from '@paying/core';
import {IPayingService} from '@paying/core';
import type {AlipaySdkCommonResult, AlipaySdkConfig} from 'alipay-sdk';
import {format} from 'date-fns';
import ms from 'ms';
import {v4 as uuid} from 'uuid';

import {Alipay} from './alipay';

interface AlipayConfig {
  appId: string;
  signedCallbackURL: string;
  paidCallbackURL: string;
  sdk: AlipaySdkConfig;
}

interface AlipayProduct extends IProduct {
  subject: string;
  amount: number;
  maxAmount: number;
  unit: 'MONTH' | 'DAY';
  duration: number;
}

export class AlipayService extends IPayingService<AlipayProduct> {
  private alipay: Alipay;

  constructor(public config: AlipayConfig, products: AlipayProduct[]) {
    super(products);
    this.alipay = new Alipay(config.sdk);
  }

  parseReceipt(): Promise<ApplyingReceipt<never>> {
    throw new Error('Method not implemented.');
  }

  getDuration(product: AlipayProduct): number {
    if (product.unit === 'DAY') {
      return product.duration * ms('1d');
    } else if (product.unit === 'MONTH') {
      return product.duration * ms('30d');
    } else {
      throw new Error(`INVALID_UNIT: ${product.unit}`);
    }
  }

  async parseCallback(callback: AlipayCallbackData): Promise<Action> {
    if (callback.notify_type === 'dut_user_sign') {
      return this.parseSigned(callback);
    } else if (callback.notify_type === 'trade_status_sync') {
      return this.validatePurchase(callback);
    }

    throw new Error(`INVALID_NOTIFY: ${callback}`);
  }

  generateOriginalTransactionId(): OriginalTransactionId {
    return uuid() as OriginalTransactionId;
  }

  generateTransactionId(): TransactionId {
    return uuid() as TransactionId;
  }

  async preparePurchaseData(
    options: PurchaseCreation<AlipayProduct>,
  ): Promise<{response: string; duration: number}> {
    let {product, transactionId} = options;

    let orderInfo = this.alipay.sign('alipay.trade.app.pay', {
      notify_url: this.config.paidCallbackURL,
      bizContent: {
        subject: product.subject,
        total_amount: product.amount,
        out_trade_no: transactionId,
        product_code: 'QUICK_MSECURITY_PAY',
      },
    });

    return {response: orderInfo, duration: this.getDuration(product)};
  }

  async prepareSubscriptionData(
    creation: PayingServiceSubscriptionPrepareOptions<AlipayProduct>,
  ): Promise<PrepareSubscriptionReturn> {
    // let duration = this.getDuration(creation.product);

    let {
      transactionId,
      originalTransactionId,
      paymentExpiresAt,
      userId,
      startsAt,
      product: {amount, subject, unit, duration, maxAmount},
    } = creation;

    let bizContent = {
      // timeout_express: '10m', // 该笔订单允许的最晚付款时间，逾期将关闭交易。取值范围：1m～15d,, 1.5h，可转换为 90m。
      total_amount: amount, // 订单总金额，单位为元，精确到小数点后两位，取值范围[0.01,]
      product_code: 'CYCLE_PAY_AUTH', // 周期扣款销售产品码固定为CYCLE_PAY_AUTH。
      body: '盯梢会员', // 对一笔交易的具体描述信息。如果是多种商品，请将商品描述字符串累加传给body。
      subject, // 交易标题
      out_trade_no: transactionId, // 商户网站唯一订单号
      time_expire: format(paymentExpiresAt, 'yyyy-MM-dd HH:mm:ss'), // 绝对最晚付款时间 '2019-12-31 10:05',
      goods_type: '0', // 商品主类型 :0-虚拟类商品,-实物类商品
      merchant_order_no: originalTransactionId, // 商户原始订单号，最大长度限制32位
      agreement_sign_params: {
        personal_product_code: 'CYCLE_PAY_AUTH_P', // 周期扣款个人签约产品码固定为CYCLE_PAY_AUTH_P
        sign_scene: 'INDUSTRY|SOCIALIZATION', // 协议签约场景，参见下文sign_scene参数说明。
        external_agreement_no: originalTransactionId, // 商户签约号，代扣协议中标示用户的唯一签约号（确保在商户系统中唯一）
        // TODO: 考虑改成 username
        external_logon_id: userId,
        sign_notify_url: this.config.signedCallbackURL,
        /*
         * 请按当前接入的方式进行填充，且输入值必须为文档中的参数取值范围。
         */
        access_params: {
          channel: 'ALIPAYAPP',
        },
        /*
         * 周期管控规则参数period_rule_params，
         * 在签约周期扣款产品（如CYCLE_PAY_AUTH_P）时必传，
         * 在签约其他产品时无需传入。
         * 周期扣款产品，会按照这里传入的参数提示用户，并对发起扣款的时间、金额、次数等做相应限制。
         */
        period_rule_params: {
          period_type: unit,
          period: duration,
          // alipay-test: 测试阿里自动扣费用
          // execute_time: format(testAt, 'yyyy-MM-dd'),
          execute_time: format(startsAt + duration, 'yyyy-MM-dd'), // 下次付款时间，扣款可提前五天扣
          single_amount: maxAmount, // 单次扣款最大金额single_amount是周期扣款产品必填，即每次发起扣款时限制的最大金额，单位为元。商户每次发起扣款都不允许大于此金额。
          // total_amount: 10000, // 总金额限制，单位为元。如果传入此参数，商户多次扣款的累计金额不允许超过此金额。
          // total_payments: 10, // 总扣款次数。如果传入此参数，则商户成功扣款的次数不能超过此次数限制（扣款失败不计入）。
        },
      },
    };

    return {
      response: this.alipay.sign('alipay.trade.app.pay', {
        notify_url: this.config.paidCallbackURL,
        bizContent,
      }),
      duration,
    };
  }

  async rechargeSubscription(
    originalTransaction: OriginalTransactionDocument,
    paymentExpiresAt: Timestamp,
  ): Promise<Action | undefined> {
    let alipayOriginalTransactionId = (originalTransaction.serviceExtra as any)
      .agreementNo;
    let transactionId = this.generateTransactionId();
    let product = this.requireProduct(originalTransaction.product);
    let startsAt = originalTransaction.expiresAt ?? (Date.now() as Timestamp);

    let result = (await this.alipay.sdk.exec('alipay.trade.pay', {
      bizContent: {
        out_trade_no: transactionId,
        // 原价续费
        total_amount: product.amount,
        subject: product.subject,
        product_code: 'CYCLE_PAY_AUTH',
        time_expire: paymentExpiresAt,
        agreement_params: {
          agreement_no: alipayOriginalTransactionId,
        },
      },
    })) as AlipayRechargeSubscriptionResponse;

    if (result.code === '10000') {
      let purchasedAt = new Date(result.gmtPayment).getTime() as Timestamp;

      return {
        type: 'subscription-renewal',
        transactionId,
        product,
        startsAt,
        expiresAt: (startsAt + this.getDuration(product)) as Timestamp,
        originalTransactionId: originalTransaction._id,
        purchasedAt,
      };
    } else if (result.code === '10003') {
      return undefined;
    } else if (
      result.code === '40004' &&
      (result.subCode === 'ACQ.TRADE_BUYER_NOT_MATCH' ||
        result.subCode === 'ACQ.MERCHANT_AGREEMENT_NOT_EXIST' ||
        result.subCode === 'ACQ.MERCHANT_AGREEMENT_INVALID' ||
        result.subCode === 'ACQ.BUYER_NOT_EXIST' ||
        result.subCode === 'ACQ.AGREEMENT_NOT_EXIST')
    ) {
      return {
        type: 'subscription-canceled',
        originalTransactionId: originalTransaction._id,
        canceledAt: Date.now() as Timestamp,
      };
    } else {
      // TODO: Retry
      return {
        type: 'recharge-failed',
        originalTransactionId: originalTransaction._id,
        failedAt: Date.now() as Timestamp,
        reason: result,
      };
    }
  }

  async cancelSubscription(
    options: CancelSubscriptionOptions,
  ): Promise<boolean> {
    let {subscription} = options;

    let unSignResult = (await this.alipay.sdk.exec(
      'alipay.user.agreement.unsign',
      {
        bizContent: {
          personal_product_code: 'CYCLE_PAY_AUTH_P',
          sign_scene: 'INDUSTRY|SOCIALIZATION',
          external_agreement_no: subscription.id,
        },
      },
    )) as AlipaySdkCommonResult;

    if (unSignResult.code === '10000') {
      return true;
    } else {
      console.error(JSON.stringify(unSignResult, null, 2));
    }

    return false;
  }

  async queryTransactionStatus(
    transactionId: TransactionId,
  ): Promise<TransactionStatusCheckingResult> {
    let result = (await this.alipay.sdk.exec('alipay.trade.query', {
      bizContent: {
        out_trade_no: transactionId,
      },
    })) as AlipayTradeQueryResult;

    if (
      result.tradeStatus === 'TRADE_FINISHED' ||
      result.tradeStatus === 'TRADE_SUCCESS'
    ) {
      return {
        type: 'success',
        purchasedAt: new Date(result.sendPayDate).getTime() as Timestamp,
      };
    } else if (
      result.tradeStatus === 'TRADE_CLOSED' ||
      (result.code === '40004' && result.subCode === 'ACQ.TRADE_NOT_EXIST')
    ) {
      return {
        type: 'canceled',
        canceledAt: Date.now() as Timestamp,
      };
    } else {
      return {
        type: 'pending',
      };
    }
  }

  async querySubscriptionStatus(
    originalTransactionId: OriginalTransactionId,
  ): Promise<SubscriptionStatusCheckingResult> {
    let result = (await this.alipay.sdk.exec(
      'alipay.user.agreement.query',
      {
        bizContent: {
          external_agreement_no: originalTransactionId,
          sign_scene: 'INDUSTRY|SOCIALIZATION',
          personal_product_code: 'CYCLE_PAY_AUTH_P',
        },
      },
      // {validateSign: true},
    )) as AlipayAgreementQueryResult;

    if (result.status === 'NORMAL') {
      return {
        type: 'subscribed',
        subscribedAt: new Date(result.signTime).getTime() as Timestamp,
      };
    } else if (
      result.code === '40004' &&
      result.subCode !== 'SYSTEM_ERROR' &&
      result.subCode !== 'INVALID_PARAMETER'
    ) {
      return {
        type: 'canceled',
        canceledAt: Math.min(
          new Date(result.invalidTime).getTime(),
          Date.now(),
        ) as Timestamp,
        reason: result,
      };
    } else {
      return {
        type: 'pending',
      };
    }
  }

  private async validatePurchase(
    callbackData: AlipayPaidCallbackData,
  ): Promise<PaymentConfirmedAction> {
    // TODO: 错误处理
    if (
      callbackData.trade_status !== 'TRADE_SUCCESS' &&
      callbackData.trade_status !== 'TRADE_FINISHED'
    ) {
      throw new Error(
        `Expected "TRADE_SUCCESS" OR "TRADE_FINISHED" but got ${callbackData.trade_status}`,
      );
    }

    this.alipay.validateNotifySign(callbackData);

    return {
      type: 'payment-confirmed',
      purchasedAt: new Date(callbackData.gmt_payment).getTime() as Timestamp,
      transactionId: callbackData.out_trade_no as TransactionId,
    };
  }

  private async parseSigned(
    callbackData: AlipaySignedCallbackData,
  ): Promise<SubscribedAction> {
    if (callbackData.status !== 'NORMAL') {
      throw new Error(
        `INVALID_STATUS: Expected "NORMAL", got "${callbackData.status}"`,
      );
    }

    this.alipay.validateNotifySign(callbackData);

    return {
      type: 'subscribed',
      subscribedAt: new Date(callbackData.sign_time).getTime() as Timestamp,
      originalTransactionId:
        callbackData.external_agreement_no as OriginalTransactionId,
      extra: {
        agreementNo: callbackData.agreement_no,
      },
    };
  }
}

type AlipayCallbackData = AlipayPaidCallbackData | AlipaySignedCallbackData;

export interface AlipayPaidCallbackData {
  gmt_create: string; // '2021-11-19 14:53:38';
  charset: 'utf-8';
  seller_email: string; // 'admin@mufan.com';
  subject: string; // '按月续费';
  sign: string;
  body: string; // '盯梢会员';
  buyer_id: string; // '2088212270326166';
  invoice_amount: string; // '0.00';
  notify_id: string; // '2021111900222145338026161443759441';
  fund_bill_list: '[{"amount":"0.01";"fundChannel":"POINT"}]';
  notify_type: 'trade_status_sync';
  trade_status: 'TRADE_SUCCESS';

  receipt_amount: string; // '0.01'
  app_id: string; // '2021002185682365';
  buyer_pay_amount: string; // '0.01';
  sign_type: 'RSA2';
  seller_id: string; // '2088821061667722';
  gmt_payment: string; // '2021-11-19 14:53:38';
  notify_time: string; // '2021-11-19 14:53:38';
  version: string; // '1.0'
  // transactionId
  out_trade_no: string; // '30202941803185052217352304782';
  total_amount: string; // '0.01';
  trade_no: string; // '2021111922001426161427910014';
  auth_app_id: string; // '2021002185682365';
  buyer_logon_id: string; // '180****3990';
  point_amount: string; // '0.01';
}

export interface AlipaySignedCallbackData {
  charset: 'utf-8';
  notify_time: string; // '2021-11-19 14:53:39';
  external_logon_id: string; // '18600000000';
  alipay_user_id: string; // '2088212270326166';
  sign: string;
  // original-transaction-id
  external_agreement_no: string; // '6197494bdf7bab4dcec977c0';
  version: '1.0';
  sign_time: string; // '2021-11-19 14:53:39';
  notify_id: string; // '2021111900222145339047211459580461';
  notify_type: 'dut_user_sign';
  agreement_no: string; // '20215919764488921116';
  invalid_time: string; // '2115-02-01 00:00:00';
  auth_app_id: string; // '2021002185682365';
  personal_product_code: 'CYCLE_PAY_AUTH_P';
  valid_time: string; // '2021-11-19 14:53:39';
  app_id: string; // '2021002185682365';
  sign_type: 'RSA2';
  sign_scene: 'INDUSTRY|SOCIALIZATION';
  status: 'NORMAL' | 'UNSIGN';
  alipay_logon_id: string; // '180******90';
}

export interface AlipayRechargeSubscriptionResponse {
  code: string; // '10000',
  subCode: string | undefined;
  msg: string; // 'Success',
  buyerLogonId: string; // '180******90',
  buyerPayAmount: string; // '0.01',
  buyerUserId: string; // '2088212270326166',
  fundBillList: {amount: string; fundChannel: 'ALIPAYACCOUNT'}[]; //  [ { amount: '0.01', fundChannel: 'ALIPAYACCOUNT' } ],
  gmtPayment: string; // '2021-11-23 18:15:01',
  invoiceAmount: string; // '0.01',
  // transaction_id
  outTradeNo: string; // '30209541012838338030000524743',
  pointAmount: string; // '0.00',
  receiptAmount: string; // '0.01',
  totalAmount: string; // '0.01',
  tradeNo: string; // '2021112322001426161430924837'
}

/**
 * https://opendocs.alipay.com/apis/028xq9#响应参数
 */
export interface AlipayTradeQueryResult {
  code: '10000' | string;
  msg: string;
  subCode: 'ACQ.TRADE_NOT_EXIST' | string;
  subMsg: string;
  buyerLogonId: string;
  buyerPayAmount: string;
  buyerUserId: string;
  invoiceAmount: string;
  outTradeNo: string;
  pointAmount: string;
  receiptAmount: string;
  sendPayDate: string;
  totalAmount: string;
  tradeNo: string;
  tradeStatus:
    | 'WAIT_BUYER_PAY'
    | 'TRADE_SUCCESS'
    | 'TRADE_CLOSED'
    | 'TRADE_FINISHED';
}

export interface AlipayAgreementQueryResult {
  code: string; // '10000',
  subCode: string | undefined;
  msg: string; // 'Success',
  agreementNo: string; // '20215922765358469116',
  alipayLogonId: string; // '180******90',
  externalAgreementNo?: OriginalTransactionId; // '30207899379391818180703654366',
  externalLogonId: string; // '18600000000',
  invalidTime: string; // '2115-02-01 00:00:00',
  personalProductCode: string; // 'CYCLE_PAY_AUTH_P',
  pricipalType: string; // 'CARD',
  principalId: string; // '2088212270326166',
  signScene: string; // 'INDUSTRY|SOCIALIZATION',
  signTime: string; // '2021-11-22 17:31:57',
  status: 'NORMAL' | 'TEMP' | 'STOP'; // 'NORMAL',
  thirdPartyType: string; // 'PARTNER',
  validTime: string; // '2021-11-22 17:31:57'
}
