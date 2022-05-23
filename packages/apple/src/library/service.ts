import type {
  Action,
  ApplyingReceipt,
  CancelSubscriptionOptions,
  IProduct,
  OriginalTransactionDocument,
  OriginalTransactionId,
  PayingServiceSubscriptionPrepareOptions,
  PreparePurchaseReturn,
  PrepareSubscriptionReturn,
  ProductId,
  PurchaseCreation,
  PurchaseReceipt,
  SubscriptionReceipt,
  SubscriptionStatusCheckingResult,
  Timestamp,
  TransactionId,
  TransactionStatusCheckingResult,
} from '@paying/core';
import {IPayingService} from '@paying/core';
import {decode} from 'jws';
import _ from 'lodash';
import fetch from 'node-fetch';
import type {Dict} from 'tslang';

interface AppleConfig {
  sharedSecret: string;
}

const APPLE_RECEIPT_VERIFICATION_URL_PRODUCTION =
  'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_RECEIPT_VERIFICATION_URL_SANDBOX =
  'https://sandbox.itunes.apple.com/verifyReceipt';

export interface AppleProduct extends IProduct {
  duration: number;
}

export class AppleService extends IPayingService<AppleProduct> {
  constructor(private config: AppleConfig, products: AppleProduct[]) {
    super(products);
  }

  // TODO: 考虑要不要分两种 abstractService
  rechargeSubscription(
    _originalTransaction: OriginalTransactionDocument,
    _paymentExpiresAt: Timestamp,
  ): Promise<Action | undefined> {
    throw new Error('Method not implemented.');
  }

  queryTransactionStatus(
    _transactionId: TransactionId,
  ): Promise<TransactionStatusCheckingResult> {
    throw new Error('Method not implemented.');
  }

  querySubscriptionStatus(
    _originalTransactionId: OriginalTransactionId,
  ): Promise<SubscriptionStatusCheckingResult> {
    throw new Error('Method not implemented.');
  }

  generateTransactionId(): TransactionId {
    throw new Error('Method not implemented.');
  }

  generateOriginalTransactionId(): OriginalTransactionId {
    throw new Error('Method not implemented.');
  }

  getDuration(product: AppleProduct): number {
    return product.duration;
  }

  prepareSubscriptionData(
    _options: PayingServiceSubscriptionPrepareOptions,
  ): Promise<PrepareSubscriptionReturn> {
    throw new Error('Method not implemented.');
  }

  preparePurchaseData(
    _options: PurchaseCreation<AppleProduct>,
  ): Promise<PreparePurchaseReturn> {
    throw new Error('Method not implemented.');
  }

  async parseReceipt(receipt: string): Promise<ApplyingReceipt<AppleProduct>> {
    let response = await this.validateReceipt(receipt);

    let latestReceiptInfo = response.latest_receipt_info;
    let subscription: SubscriptionReceipt<AppleProduct> | undefined;
    let purchases: PurchaseReceipt<AppleProduct>[] = [];

    if (latestReceiptInfo) {
      subscription = await this.handleSubscription(
        latestReceiptInfo,
        response.pending_renewal_info,
      );
    }

    if (response.receipt.in_app) {
      purchases = await this.handlePurchase(response.receipt.in_app);
    }

    return {subscription, purchase: purchases};
  }

  async parseCallback(callback: Dict<any>): Promise<Action | undefined> {
    let {notificationType, subtype, data} = JSON.parse(
      decode(callback.signedPayload as string).payload,
    ) as AppleNotificationPayload;

    let {signedRenewalInfo, signedTransactionInfo} = data;

    let renewalInfo = JSON.parse(
      decode(signedRenewalInfo).payload,
    ) as AppleRenewalInfo;

    let transactionInfo = JSON.parse(
      decode(signedTransactionInfo).payload,
    ) as AppleTransactionInfo;

    if (notificationType === 'DID_RENEW' || notificationType === 'SUBSCRIBED') {
      return {
        type: 'subscription-renewal',
        transactionId: transactionInfo.transactionId,
        originalTransactionId: transactionInfo.originalTransactionId,
        purchasedAt: transactionInfo.purchaseDate,
        duration: transactionInfo.expiresDate - transactionInfo.purchaseDate,
        product: this.requireProduct(transactionInfo.productId),
      };
    } else if (notificationType === 'DID_CHANGE_RENEWAL_STATUS') {
      return {
        type: 'change-renewal-status',
        originalTransactionId: transactionInfo.originalTransactionId,
        renewalEnabled: subtype === 'AUTO_RENEW_ENABLED' ? true : false,
      };
    }

    if (notificationType === 'DID_CHANGE_RENEWAL_PREF') {
      return {
        type: 'change-renewal-info',
        originalTransactionId: renewalInfo.originalTransactionId,
        productId: renewalInfo.productId,
        autoRenewProductId: renewalInfo.autoRenewProductId,
        renewalEnabled: renewalInfo.autoRenewStatus === 1 ? true : false,
      };
    }

    return undefined;
  }

  cancelSubscription(_options: CancelSubscriptionOptions): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  private async handlePurchase(
    inApp: AppleReceiptInApp[],
  ): Promise<PurchaseReceipt<AppleProduct>[]> {
    return inApp.map(receipt => {
      return {
        // 确认一下 purchase 里 original_transaction_id 的用法
        transactionId: receipt.original_transaction_id as TransactionId,
        quantity: Number.parseInt(receipt.quantity),
        product: this.requireProduct(receipt.product_id)!,
        purchasedAt: Number.parseInt(
          receipt.original_purchase_date_ms,
        ) as Timestamp,
      };
    });
  }

  private async handleSubscription(
    latestReceiptInfos: AppleSubscriptionReceiptInfo[],
    pendingRenewalInfo: AppleReceiptValidationRenewalInfo[] = [],
  ): Promise<SubscriptionReceipt<AppleProduct>> {
    let receiptInfos: AppleSubscriptionReceiptInfo[] = _.sortBy(
      latestReceiptInfos.filter(
        info =>
          // TODO: 取消的要不要存起来
          // TODO: 处理退款
          info.cancellation_date_ms === undefined,
      ),
      info => -Number.parseInt(info.purchase_date_ms),
    );

    let originalTransactionIdToRenewalInfoMap = new Map(
      pendingRenewalInfo.map(info => [
        info.original_transaction_id as OriginalTransactionId,
        info,
      ]),
    );

    let latestReceiptInfo = receiptInfos[0];

    let product = this.requireProduct(latestReceiptInfo.product_id);

    let renewalInfo = originalTransactionIdToRenewalInfoMap.get(
      latestReceiptInfo.original_transaction_id,
    );

    return {
      originalTransactionId:
        latestReceiptInfo.original_transaction_id as OriginalTransactionId,
      transactionId: latestReceiptInfo.transaction_id as TransactionId,
      purchasedAt: Number.parseInt(
        latestReceiptInfo.purchase_date_ms,
      ) as Timestamp,
      expiresAt: Number.parseInt(
        latestReceiptInfo.expires_date_ms,
      ) as Timestamp,
      autoRenewal: renewalInfo?.auto_renew_status === '1' ? true : false,
      autoRenewalProduct: renewalInfo
        ? this.productIdToProductMap.get(renewalInfo!.product_id)
        : undefined,
      subscribedAt: Number.parseInt(
        latestReceiptInfo.original_purchase_date_ms,
      ) as Timestamp,
      product,
    };
  }

  private async validateReceipt(
    receipt: string,
  ): Promise<AppleReceiptVerificationResponse> {
    if (typeof receipt !== 'string') {
      throw new Error('Receipt must be a string');
    }

    let response = await fetch(APPLE_RECEIPT_VERIFICATION_URL_PRODUCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        'receipt-data': receipt,
        password: this.config.sharedSecret,
      }),
    });

    let responseJSON =
      (await response.json()) as AppleReceiptVerificationResponse;

    if (responseJSON.status === 21007) {
      response = await fetch(APPLE_RECEIPT_VERIFICATION_URL_SANDBOX, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'receipt-data': receipt,
          password: this.config.sharedSecret,
        }),
      });

      responseJSON =
        (await response.json()) as AppleReceiptVerificationResponse;
    }

    if (responseJSON.status !== 0) {
      throw new Error(
        `INVALID_RESPONSE [${responseJSON.status}]: ${
          ERROR_INFO[responseJSON.status]
        }`,
      );
    }

    return responseJSON;
  }
}

export interface AppleNotificationPayload {
  notificationType: AppleNotificationType;
  subtype: AppleNotificationSubType;
  notificationUUID: string;
  data: {
    appAppleId: string;
    bundleId: string;
    bundleVersion: string;
    environment: 'Sandbox' | 'Production';
    signedRenewalInfo: string;
    signedTransactionInfo: string;
  };
}

export type AppleNotificationSubType =
  | 'INITIAL_BUY'
  | 'RESUBSCRIBE'
  | 'DOWNGRADE'
  | 'UPGRADE'
  | 'AUTO_RENEW_ENABLED'
  | 'AUTO_RENEW_DISABLED'
  | 'VOLUNTARY'
  | 'BILLING_RETRY'
  | 'PRICE_INCREASE'
  | 'GRACE_PERIOD'
  | 'BILLING_RECOVERY'
  | 'PENDING'
  | 'ACCEPTED';

// https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
export type AppleNotificationType =
  | 'CONSUMPTION_REQUEST'
  | 'DID_CHANGE_RENEWAL_PREF'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'DID_FAIL_TO_RENEW'
  | 'DID_RENEW'
  | 'EXPIRED'
  | 'GRACE_PERIOD_EXPIRED'
  | 'OFFER_REDEEMED'
  | 'PRICE_INCREASE'
  | 'REFUND'
  | 'REFUND_DECLINED'
  | 'RENEWAL_EXTENDED'
  | 'REVOKE'
  | 'SUBSCRIBED';

const ERROR_INFO = {
  21000: 'The App Store could not read the JSON object you provided.',
  21002: 'The data in the receipt-data property was malformed or missing.',
  21003: 'The receipt could not be authenticated.',
  21004:
    'The shared secret you provided does not match the shared secret on file for your account.',
  21005: 'The receipt server is not currently available.',
  21006:
    'This receipt is valid but the subscription has expired. When this status code is returned to your server, the receipt data is also decoded and returned as part of the response.',
  21007:
    'This receipt is from the test environment, but it was sent to the production service for verification. Send it to the test environment service instead.',
  21008:
    'This receipt is from the production receipt, but it was sent to the test environment service for verification. Send it to the production environment service instead.',
  21009: 'Internal data access error. Try again later.',
  21010: 'The user account cannot be found or has been deleted.',
};

/**
 * https://developer.apple.com/documentation/appstorereceipts/responsebody
 */
interface AppleReceiptVerificationResponse {
  /**
   * https://developer.apple.com/documentation/appstorereceipts/status
   */
  status:
    | 0
    | 21000
    // 21001 abandoned
    | 21002
    | 21003
    | 21004
    | 21005
    | 21006
    | 21007
    | 21008
    | 21009
    | 21010;
  latest_receipt_info: AppleSubscriptionReceiptInfo[];
  receipt: {
    receipt_type: 'ProductionSandbox';
    adam_id: number;
    app_item_id: number;
    bundle_id: string;
    application_version: string;
    download_id: number;
    version_external_identifier: number;
    receipt_creation_date: string;
    receipt_creation_date_ms: string;
    receipt_creation_date_pst: string;
    request_date: string;
    request_date_ms: string;
    request_date_pst: string;
    original_purchase_date: string;
    original_purchase_date_ms: string;
    original_purchase_date_pst: string;
    original_application_version: string;
    expiration_date_ms: string;
    in_app: AppleReceiptInApp[];
  };
  pending_renewal_info?: AppleReceiptValidationRenewalInfo[];
}

export interface AppleSubscriptionReceiptInfo {
  quantity: string | undefined; // '1';
  cancellation_date_ms: string | undefined; // '0';
  product_id: ProductId; // 'membership_monthly';
  transaction_id: TransactionId; // '1000000906292005';
  original_transaction_id: OriginalTransactionId; // '1000000905178701';
  purchase_date: string; // '2021-11-08 12:31:26 Etc/GMT';
  purchase_date_ms: string; // '1636374686000';
  purchase_date_pst: string | undefined; // '2021-11-08 04:31:26 America/Los_Angeles';
  original_purchase_date: string; // '2021-11-08 12:30:33 Etc/GMT';
  original_purchase_date_ms: string; // '1636374633000';
  original_purchase_date_pst: string | undefined; // '2021-11-08 04:30:33 America/Los_Angeles';
  expires_date: string; // '2021-11-08 12:36:26 Etc/GMT';
  expires_date_ms: string; // '1636374986000';
  expires_date_pst: string; // '2021-11-08 04:36:26 America/Los_Angeles';
  web_order_line_item_id: string | undefined; // '1000000067755780';
  is_trial_period: string | undefined; // 'false';
  is_in_intro_offer_period: string | undefined; // 'false';
  in_app_ownership_type: string | undefined; // 'PURCHASED';
  subscription_group_identifier: string; // '20900378'
}

interface AppleReceiptInApp {
  quantity: string;
  product_id: ProductId;
  transaction_id: string;
  original_transaction_id: string;
  purchase_date: string;
  purchase_date_ms: string;
  purchase_date_pst: string;
  original_purchase_date: string;
  original_purchase_date_ms: string;
  original_purchase_date_pst: string;
  is_trial_period: string;
  in_app_ownership_type: string;
}

export interface AppleReceiptValidationRenewalInfo {
  auto_renew_product_id: string; // 'membership_quarterly',
  product_id: ProductId; // 'membership_monthly',
  original_transaction_id: OriginalTransactionId; // '1000000905178701',
  auto_renew_status: '1' | '0'; // '1'
}

// https://developer.apple.com/documentation/appstoreservernotifications/jwsrenewalinfodecodedpayload
export interface AppleRenewalInfo {
  originalTransactionId: OriginalTransactionId;
  autoRenewProductId: ProductId;
  productId: ProductId;
  // 0: off, 1: on
  autoRenewStatus: 0 | 1;
  signedDate: number;
  /**
   * 0: The customer hasn’t responded to the subscription price increase.
   * 1: The customer consented to the subscription price increase.
   */
  priceIncreaseStatus?: 0 | 1;
}

// https://developer.apple.com/documentation/appstoreservernotifications/jwstransactiondecodedpayload
export interface AppleTransactionInfo {
  transactionId: TransactionId;
  originalTransactionId: OriginalTransactionId;
  webOrderLineItemId: string;
  productId: ProductId;
  subscriptionGroupIdentifier: string;
  purchaseDate: Timestamp;
  originalPurchaseDate: Timestamp;
  expiresDate: Timestamp;
  quantity: number;
  type: string;
  inAppOwnershipType: string;
  signedDate: Timestamp;
}
