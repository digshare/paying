import type {Nominal} from 'tslang';

import type {Timestamp, UserId} from './transaction';

export type OriginalTransactionId = Nominal<string, 'original-transaction-id'>;

export interface OriginalTransactionDocument {
  _id: OriginalTransactionId;
  // thirdPartyId: string | undefined;
  product: string;
  productGroup: string | undefined;
  startsAt: Timestamp;
  expiresAt: Timestamp;
  signedAt: Timestamp | undefined;
  canceledAt: Timestamp | undefined;
  cancelReason: unknown | undefined;
  renewalEnabled: boolean;
  lastFailedReason?: unknown;
  user: UserId;
  type: string;
  raw: unknown | undefined;
}
