export type PaymentStatus = 'pending' | 'settled' | 'failed';
export type ConsumerStatus = 'pending' | 'succeeded' | 'failed';

export interface ConsumerAcknowledgement {
  paymentId: string;
  consumerName: 'fraud' | 'ledger' | 'notify';
  status: ConsumerStatus;
  eventId: string;
  acknowledgedAt: string | null;
  errorCode?: string | null;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  consistency: 'eventual';
  acknowledgements: ConsumerAcknowledgement[];
}
