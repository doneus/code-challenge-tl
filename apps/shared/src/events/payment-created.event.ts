export interface PaymentCreatedEvent {
  eventId: string;
  paymentId: string;
  countryCode: string;
  amount: string;
  currency: string;
  createdAt: string;
}

export interface ConsumerEventEnvelope {
  deliveryAttempt?: number;
  maxRetries?: number;
}

export type PaymentConsumerEvent = PaymentCreatedEvent & ConsumerEventEnvelope;
