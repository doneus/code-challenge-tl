export class CreatePaymentDto {
  countryCode!: string;
  amount!: string;
  currency!: string;
}

export interface CreatePaymentAcceptedResponse {
  paymentId: string;
  eventId: string;
  status: 'pending';
}
