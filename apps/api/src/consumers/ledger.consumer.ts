import { Injectable, Logger } from '@nestjs/common';
import { PaymentConsumerEvent } from '@app/shared/events/payment-created.event';
import { CONSUMER_NAME_LEDGER } from './consumer-receipt.entity';
import { ConsumerProcessingService } from './consumer-processing.service';

@Injectable()
export class LedgerConsumer {
  private readonly logger = new Logger(LedgerConsumer.name);

  constructor(private readonly processingService: ConsumerProcessingService) {}

  async handle(event: PaymentConsumerEvent): Promise<'processed' | 'duplicate'> {
    return this.processingService.process(CONSUMER_NAME_LEDGER, event, async () => {
      this.logger.log(`Ledger posting payment ${event.paymentId}`);
    });
  }
}
