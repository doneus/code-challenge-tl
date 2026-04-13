import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConsumerAcknowledgement,
  PaymentStatusResponse,
} from '@app/shared/payments/payment-status.contract';
import { In, Repository } from 'typeorm';
import {
  CONSUMER_ACK_FAILED,
  CONSUMER_ACK_SUCCEEDED,
  ConsumerAckEntity,
} from '../consumers/consumer-ack.entity';
import {
  CONSUMER_NAME_FRAUD,
  CONSUMER_NAME_LEDGER,
  CONSUMER_NAME_NOTIFY,
} from '../consumers/consumer-receipt.entity';
import { PAYMENT_STATUS_FAILED, PAYMENT_STATUS_PENDING, PAYMENT_STATUS_SETTLED, PaymentEntity } from './payment.entity';

@Injectable()
export class StatusQueryService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(ConsumerAckEntity)
    private readonly ackRepository: Repository<ConsumerAckEntity>,
  ) {}

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    const acks = await this.ackRepository.find({
      where: {
        paymentId,
        consumerName: In([CONSUMER_NAME_FRAUD, CONSUMER_NAME_LEDGER, CONSUMER_NAME_NOTIFY]),
      },
      order: { consumerName: 'ASC' },
    });

    const required = [CONSUMER_NAME_FRAUD, CONSUMER_NAME_LEDGER];
    const requiredAcks = acks.filter((ack) => required.includes(ack.consumerName));

    const hasRequiredSuccess = required.every((consumerName) =>
      requiredAcks.some(
        (ack) => ack.consumerName === consumerName && ack.status === CONSUMER_ACK_SUCCEEDED,
      ),
    );

    const hasRequiredFailure = requiredAcks.some((ack) => ack.status === CONSUMER_ACK_FAILED);

    const status = hasRequiredFailure || payment.status === PAYMENT_STATUS_FAILED
      ? PAYMENT_STATUS_FAILED
      : hasRequiredSuccess
        ? PAYMENT_STATUS_SETTLED
        : PAYMENT_STATUS_PENDING;

    const acknowledgements: ConsumerAcknowledgement[] = acks.map((ack) => ({
      paymentId,
      consumerName: ack.consumerName as ConsumerAcknowledgement['consumerName'],
      status: ack.status as ConsumerAcknowledgement['status'],
      eventId: ack.eventId,
      acknowledgedAt: ack.acknowledgedAt ? ack.acknowledgedAt.toISOString() : null,
      errorCode: ack.errorCode,
    }));

    return {
      paymentId,
      status,
      consistency: 'eventual',
      acknowledgements,
    };
  }
}
