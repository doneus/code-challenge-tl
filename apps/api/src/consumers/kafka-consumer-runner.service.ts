import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, type Consumer, type KafkaMessage } from 'kafkajs';
import { getKafkaRuntimeConfig } from '@app/shared/config/kafka.config';
import { PaymentConsumerEvent } from '@app/shared/events/payment-created.event';
import { FraudConsumer } from './fraud.consumer';
import { LedgerConsumer } from './ledger.consumer';
import { NotifyConsumer } from './notify.consumer';

type DomainConsumer = {
  name: 'fraud' | 'ledger' | 'notify';
  groupId: string;
  handle: (event: PaymentConsumerEvent) => Promise<'processed' | 'duplicate'>;
};

@Injectable()
export class KafkaConsumerRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerRunnerService.name);
  private readonly kafkaConfig = getKafkaRuntimeConfig('payment-api-consumers');
  private readonly kafka = new Kafka({
    clientId: this.kafkaConfig.clientId,
    brokers: this.kafkaConfig.brokers,
  });
  private readonly consumers: Consumer[] = [];
  private readonly retryIntervalMs = Number(process.env.API_KAFKA_RETRY_INTERVAL_MS ?? 5000);
  private started = false;
  private starting = false;
  private shuttingDown = false;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly fraudConsumer: FraudConsumer,
    private readonly ledgerConsumer: LedgerConsumer,
    private readonly notifyConsumer: NotifyConsumer,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.API_DISABLE_KAFKA_CONSUMERS === '1') {
      this.logger.warn('Kafka consumers disabled by API_DISABLE_KAFKA_CONSUMERS=1');
      return;
    }

    this.scheduleStartAttempt(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.clearRetryTimer();
    await this.disconnectAllConsumers();
    this.started = false;
    this.starting = false;
  }

  private scheduleStartAttempt(delayMs: number): void {
    if (this.shuttingDown || this.started || this.starting || this.retryTimer) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.startConsumers();
    }, delayMs);
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) {
      return;
    }

    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private async startConsumers(): Promise<void> {
    if (this.shuttingDown || this.started || this.starting) {
      return;
    }

    this.starting = true;

    const domainConsumers: DomainConsumer[] = [
      {
        name: 'fraud',
        groupId: process.env.FRAUD_CONSUMER_GROUP ?? 'fraud-consumer',
        handle: (event) => this.fraudConsumer.handle(event),
      },
      {
        name: 'ledger',
        groupId: process.env.LEDGER_CONSUMER_GROUP ?? 'ledger-consumer',
        handle: (event) => this.ledgerConsumer.handle(event),
      },
      {
        name: 'notify',
        groupId: process.env.NOTIFY_CONSUMER_GROUP ?? 'notify-consumer',
        handle: (event) => this.notifyConsumer.handle(event),
      },
    ];

    try {
      for (const domainConsumer of domainConsumers) {
        const consumer = this.kafka.consumer({ groupId: domainConsumer.groupId });
        await consumer.connect();
        await consumer.subscribe({ topic: this.kafkaConfig.paymentCreatedTopic, fromBeginning: false });

        void consumer.run({
          eachMessage: async ({ message }) => {
            const event = this.parseEvent(message);
            if (!event) {
              return;
            }

            await domainConsumer.handle(event);
          },
        }).catch((error: unknown) => {
          if (this.shuttingDown) {
            return;
          }

          const detail = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Kafka consumer ${domainConsumer.name} stopped unexpectedly (${detail}). Retrying startup...`,
          );
          void this.restartConsumers();
        });

        this.consumers.push(consumer);

        this.logger.log(
          `Kafka consumer ${domainConsumer.name} connected group=${domainConsumer.groupId} topic=${this.kafkaConfig.paymentCreatedTopic}`,
        );
      }

      this.started = true;
      this.logger.log('Kafka consumers are active.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Kafka consumers not started yet (${detail}). Retrying in ${this.retryIntervalMs}ms.`,
      );
      await this.disconnectAllConsumers();
      this.scheduleStartAttempt(this.retryIntervalMs);
    } finally {
      this.starting = false;
    }
  }

  private async restartConsumers(): Promise<void> {
    if (this.shuttingDown || this.starting) {
      return;
    }

    this.started = false;
    await this.disconnectAllConsumers();
    this.scheduleStartAttempt(this.retryIntervalMs);
  }

  private async disconnectAllConsumers(): Promise<void> {
    await Promise.all(
      this.consumers.map(async (consumer) => {
        await consumer.disconnect();
      }),
    );
    this.consumers.length = 0;
  }

  private parseEvent(message: KafkaMessage): PaymentConsumerEvent | null {
    if (!message.value) {
      this.logger.warn('Skipping Kafka message with empty payload');
      return null;
    }

    try {
      const raw = message.value.toString('utf8');
      return JSON.parse(raw) as PaymentConsumerEvent;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Invalid Kafka payload; unable to parse payment event: ${detail}`);
      return null;
    }
  }
}