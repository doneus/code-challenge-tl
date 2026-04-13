import { Injectable, Logger } from '@nestjs/common';
import { PaymentConsumerEvent } from '@app/shared/events/payment-created.event';
import { CONSUMER_NAME_FRAUD } from './consumer-receipt.entity';
import { ConsumerProcessingService } from './consumer-processing.service';

@Injectable()
export class FraudConsumer {
  private readonly logger = new Logger(FraudConsumer.name);

  constructor(private readonly processingService: ConsumerProcessingService) {}

  async handle(event: PaymentConsumerEvent): Promise<'processed' | 'duplicate'> {
    return this.processingService.process(CONSUMER_NAME_FRAUD, event, async () => {
      const parsedAmount = Number(event.amount);
      if (Number.isFinite(parsedAmount) && parsedAmount.toFixed(2) === '13.37') {
        throw new Error('Fraud rule rejected payment amount 13.37');
      }

      this.logger.log(`Fraud scoring payment ${event.paymentId}`);
    });
  }
}
