import type {Nominal} from 'tslang';

import type {Timestamp, UserId} from './transaction';

export type OriginalTransactionId = Nominal<string, 'original-transaction-id'>;

export interface OriginalTransactionDocument {
  _id: OriginalTransactionId;
  // thirdPartyId: string | undefined;
  product: string;
  productGroup: string | undefined;

  createdAt: Timestamp;
  /**
   * starts at 和 expires at 未设置时代表创建但未支付，当支付后才会更新
   */
  startsAt: Timestamp | undefined;
  expiresAt: Timestamp | undefined;
  signedAt: Timestamp | undefined;
  canceledAt: Timestamp | undefined;

  cancelReason: unknown | undefined;
  renewalEnabled: boolean;
  lastFailedReason?: unknown;
  user: UserId;
  type: string;
  raw: unknown | undefined;
}
