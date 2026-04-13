import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaymentConsumerEvent } from '@app/shared/events/payment-created.event';
import { Repository } from 'typeorm';
import { DltPublisher } from '../dlt/dlt.publisher';
import {
  CONSUMER_ACK_FAILED,
  CONSUMER_ACK_SUCCEEDED,
  ConsumerAckEntity,
} from './consumer-ack.entity';
import { ConsumerReceiptEntity } from './consumer-receipt.entity';

@Injectable()
export class ConsumerProcessingService {
  private readonly logger = new Logger(ConsumerProcessingService.name);

  constructor(
    @InjectRepository(ConsumerReceiptEntity)
    private readonly receiptRepository: Repository<ConsumerReceiptEntity>,
    @InjectRepository(ConsumerAckEntity)
    private readonly ackRepository: Repository<ConsumerAckEntity>,
    private readonly dltPublisher: DltPublisher,
  ) {}

  async process(
    consumerName: string,
    event: PaymentConsumerEvent,
    sideEffect: () => Promise<void>,
  ): Promise<'processed' | 'duplicate'> {
    const existing = await this.receiptRepository.findOne({
      where: { consumerName, eventId: event.eventId },
    });

    if (existing) {
      existing.deliveryCount += 1;
      await this.receiptRepository.save(existing);
      return 'duplicate';
    }

    await this.receiptRepository.save(
      this.receiptRepository.create({
        consumerName,
        eventId: event.eventId,
        paymentId: event.paymentId,
      }),
    );

    try {
      await sideEffect();

      await this.ackRepository.save(
        this.ackRepository.create({
          paymentId: event.paymentId,
          consumerName,
          eventId: event.eventId,
          status: CONSUMER_ACK_SUCCEEDED,
          acknowledgedAt: new Date(),
          errorCode: null,
          errorDetail: null,
        }),
      );

      return 'processed';
    } catch (error) {
      const attempt = event.deliveryAttempt ?? 1;
      const maxRetries = event.maxRetries ?? 3;
      const exhausted = attempt >= maxRetries;
      const detail = error instanceof Error ? error.message : String(error);

      await this.ackRepository.save(
        this.ackRepository.create({
          paymentId: event.paymentId,
          consumerName,
          eventId: event.eventId,
          status: CONSUMER_ACK_FAILED,
          acknowledgedAt: new Date(),
          errorCode: exhausted ? 'RETRY_EXHAUSTED' : 'CONSUMER_ERROR',
          errorDetail: detail,
        }),
      );

      if (exhausted) {
        await this.dltPublisher.publishPaymentFailed({
          paymentId: event.paymentId,
          eventId: event.eventId,
          consumerName,
          reason: detail,
        });
      }

      this.logger.warn(
        `Consumer ${consumerName} failed for event ${event.eventId}. exhausted=${exhausted}`,
      );

      throw error;
    }
  }
}
