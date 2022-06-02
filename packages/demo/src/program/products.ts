import type {AlipayProduct} from '@paying/alipay';
import type {ProductId} from '@paying/core';

export const ALIPAY_PRODUCTS: AlipayProduct[] = [
  {
    type: 'subscription',
    amount: 0.01,
    maxAmount: 0.01,
    group: 'membership',
    subject: 'Monthly Membership',
    unit: 'DAY',
    id: 'alipay-monthly-membership' as ProductId,
  },
];
