import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Kafka, type ProducerRecord } from 'kafkajs';
import { getKafkaRuntimeConfig } from '@app/shared/config/kafka.config';

interface KafkaProducerClient {
  connect?: () => Promise<void>;
  send: (record: ProducerRecord) => Promise<unknown>;
  disconnect?: () => Promise<void>;
}

@Injectable()
export class DltPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(DltPublisher.name);
  private readonly kafka = getKafkaRuntimeConfig('api-dlt');
  private readonly kafkaClient = new Kafka({
    clientId: this.kafka.clientId,
    brokers: this.kafka.brokers,
  });
  private producer: KafkaProducerClient | null = null;
  private producerConnectPromise: Promise<void> | null = null;

  constructor(@Optional() private readonly producerOverride?: KafkaProducerClient) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.producer || !this.producer.disconnect) {
      return;
    }

    await this.producer.disconnect();
    this.producer = null;
    this.producerConnectPromise = null;
  }

  private async getProducer(): Promise<KafkaProducerClient> {
    if (this.producer) {
      return this.producer;
    }

    this.producer = this.producerOverride ?? this.kafkaClient.producer();

    if (this.producer.connect) {
      this.producerConnectPromise ??= this.producer.connect();
      await this.producerConnectPromise;
    }

    return this.producer;
  }

  async publishPaymentFailed(payload: Record<string, unknown>): Promise<void> {
    const producer = await this.getProducer();
    const eventId = typeof payload.eventId === 'string' ? payload.eventId : undefined;

    await producer.send({
      topic: this.kafka.deadLetterTopic,
      messages: [
        {
          key: eventId,
          value: JSON.stringify(payload),
          headers: eventId ? { eventId } : undefined,
        },
      ],
    });

    this.logger.warn(`DLT published to ${this.kafka.deadLetterTopic} for event ${eventId ?? 'n/a'}`);
  }
}
