import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { getKafkaRuntimeConfig } from '@app/shared/config/kafka.config';
import { PaymentCreatedEvent } from '@app/shared/events/payment-created.event';
import { OUTBOX_STATUS_PENDING, OutboxEventEntity } from '../outbox/outbox.entity';
import { PAYMENT_STATUS_PENDING, PaymentEntity } from './payment.entity';
import { CreatePaymentAcceptedResponse, CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentService {
  private readonly kafka = getKafkaRuntimeConfig('payment-api');

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createPayment(dto: CreatePaymentDto): Promise<CreatePaymentAcceptedResponse> {
    return this.dataSource.transaction(async (manager) => {
      const payment = manager.create(PaymentEntity, {
        countryCode: dto.countryCode.toUpperCase(),
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        status: PAYMENT_STATUS_PENDING,
      });

      const savedPayment = await manager.save(PaymentEntity, payment);
      const eventId = randomUUID();

      const eventPayload: PaymentCreatedEvent = {
        eventId,
        paymentId: savedPayment.id,
        countryCode: savedPayment.countryCode,
        amount: savedPayment.amount,
        currency: savedPayment.currency,
        createdAt: savedPayment.createdAt.toISOString(),
      };

      const outbox = manager.create(OutboxEventEntity, {
        paymentId: savedPayment.id,
        aggregateType: 'payment',
        eventId,
        topic: this.kafka.paymentCreatedTopic,
        payload: eventPayload as unknown as Record<string, unknown>,
        status: OUTBOX_STATUS_PENDING,
      });

      await manager.save(OutboxEventEntity, outbox);

      return {
        paymentId: savedPayment.id,
        eventId,
        status: PAYMENT_STATUS_PENDING,
      };
    });
  }
}
