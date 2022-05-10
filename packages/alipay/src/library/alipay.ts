import {URLSearchParams} from 'url';

import type {AlipaySdkConfig} from 'alipay-sdk';
import AlipaySdk from 'alipay-sdk';
import {sign} from 'alipay-sdk/lib/util';

export class Alipay {
  sdk: AlipaySdk;

  constructor(sdkConfig: AlipaySdkConfig) {
    this.sdk = new AlipaySdk(sdkConfig);
  }

  sign(method: string, params: object): string {
    let signedOrderInfo = sign(method, params, this.sdk.config);

    return new URLSearchParams(Object.entries(signedOrderInfo)).toString();
  }

  validateNotifySign(params: object): void {
    let verified = this.sdk.checkNotifySign(params);

    if (!verified) {
      throw new Error('Alipay notify sign is not valid');
    }
  }
}
