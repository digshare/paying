export interface PayingServicePrepareSubscriptionOptions {}

export interface PayingServicePrepareSubscriptionResult {}

export interface IPayingService {
  prepareSubscription(
    options: PayingServicePrepareSubscriptionOptions,
  ): Promise<PayingServicePrepareSubscriptionResult>;

  submitSubscription(options: unknown): unknown;

  handleCallback(data: unknown): {
    type: 'renew';
    expiresAt: Date;
  };

  handleReceipt(data: unknown):
    | {
        type: 'subscription';
        prepare: PayingPrepareSubscriptionOptions;
        submit: PayingSubmitSubscriptionOptions;
      }
    | {
        type: 'payment';
        prepare: PayingPreparePaymentOptions;
        submit: PayingSubmitPaymentOptions;
      };
}

export class PayingUser {
  constructor(readonly id: string, readonly paying: Paying) {}

  prepareSubscription(
    serviceName: string,
    options: PayingPrepareSubscriptionOptions,
  ): Promise<PreparingSubscription> {
    return this.paying.prepareSubscription(this.id, serviceName, options);
  }

  handleReceipt(
    userId: string,
    serviceName: string,
    data: unknown,
  ): Promise<void> {
    return this.paying.handleReceipt(this.id, serviceName, data);
  }
}

export interface SubscriptionDocument {
  service: string;
}

export interface IPayingDB {
  findOneSubscription(
    query: unknown,
  ): Promise<SubscriptionDocument | undefined>;
  findSubscriptions(query: unknown): Promise<SubscriptionDocument[]>;
}

export interface PayingOptions {}

export class Paying {
  constructor(
    readonly services: Record<string, IPayingService>,
    readonly db: IPayingDB, // readonly options: PayingOptions,
  ) {}

  user(id: string): PayingUser {
    return new PayingUser(id, this);
  }

  async handleReceipt(
    userId: string,
    serviceName: string,
    data: unknown,
  ): Promise<void> {
    const service = this.requireService(serviceName);

    const {prepare: prepareOptions, submit: submitOptions} =
      service.handleReceipt(data);

    await this.prepareSubscription(userId, serviceName, prepareOptions);

    await this.submitSubscription(userId, serviceName, submitOptions);
  }

  async handleCallback(serviceName: string, data: unknown): Promise<void> {
    const service = this.requireService(serviceName);

    const result = service.handleCallback(data);

    switch (result.type) {
      case 'renew':
        break;

      default:
        break;
    }
  }

  async prepareSubscription(
    userId: string,
    serviceName: string,
    {name}: PayingPrepareSubscriptionOptions,
  ): Promise<PreparingSubscription> {
    const service = this.requireService(serviceName);

    const subscription = new PreparingSubscription(userId, {}, service);

    let subscriptionDoc = await this.db.findOneSubscription({
      user: userId,
      name,
    });

    if (subscriptionDoc) {
      const service = this.requireService(subscriptionDoc.service);

      // apple -> apple
    }

    let result = await service.prepareSubscription({});

    return subscription;
  }

  async submitSubscription(
    userId: string,
    serviceName: string,
    options: PayingSubmitSubscriptionOptions,
  ): Promise<void> {}

  private requireService(serviceName: string): IPayingService {
    const service = this.services[serviceName];

    if (!service) {
      throw new Error(`Unknown PayingService ${JSON.stringify(serviceName)}`);
    }

    return service;
  }
}

export interface PayingPrepareSubscriptionOptions {
  /**
   * Subscription name, e.g.: "premium-membership".
   */
  name: string;
}

export interface PayingSubmitSubscriptionOptions {}

export interface PayingPreparePaymentOptions {}

export interface PayingSubmitPaymentOptions {}

export class PreparingSubscription {
  constructor(
    readonly userId: string,
    readonly options: PreparingSubscriptionOptions,
    readonly service: IPayingService,
  ) {}

  async submit(): Promise<void> {
    await this.service.submitSubscription({});
  }
}

export interface PreparingSubscriptionOptions {}

function getExpiration(transactions: any[], now = Date.now()): number {
  let startsAt = 0;
  let expiresAt = 0;

  transactions.sort((x, y) => x.startsAt - y.startsAt);

  for (let transaction of transactions) {
    if (startsAt > Math.max(now, expiresAt)) {
      break;
    }

    if (transaction.startsAt <= expiresAt) {
      expiresAt += transaction.expiresAt - transaction.startsAt;
    } else {
      startsAt = transaction.startsAt;
      expiresAt = transaction.expiresAt;
    }
  }

  return expiresAt;
}
