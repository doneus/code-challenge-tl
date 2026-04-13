import { Injectable, Logger } from '@nestjs/common';
import { PaymentConsumerEvent } from '@app/shared/events/payment-created.event';
import { CONSUMER_NAME_NOTIFY } from './consumer-receipt.entity';
import { ConsumerProcessingService } from './consumer-processing.service';

@Injectable()
export class NotifyConsumer {
  private readonly logger = new Logger(NotifyConsumer.name);

  constructor(private readonly processingService: ConsumerProcessingService) {}

  async handle(event: PaymentConsumerEvent): Promise<'processed' | 'duplicate'> {
    return this.processingService.process(CONSUMER_NAME_NOTIFY, event, async () => {
      this.logger.log(`Notify delivery for payment ${event.paymentId}`);
    });
  }
}
