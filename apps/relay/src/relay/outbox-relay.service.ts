import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Kafka, type Producer, type ProducerRecord } from 'kafkajs';
import { DataSource, QueryRunner } from 'typeorm';
import { getKafkaRuntimeConfig } from '@app/shared/config/kafka.config';
import {
  OUTBOX_STATUS_FAILED,
  OUTBOX_STATUS_PENDING,
  OUTBOX_STATUS_RELAYED,
} from '../../../api/src/outbox/outbox.entity';

interface OutboxRow {
  id: string;
  event_id: string;
  topic: string;
  payload: Record<string, unknown>;
  relay_attempts: number;
}

interface KafkaProducerClient {
  connect?: () => Promise<void>;
  send: (record: ProducerRecord) => Promise<unknown>;
  disconnect?: () => Promise<void>;
}

@Injectable()
export class OutboxRelayService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly kafka = getKafkaRuntimeConfig('outbox-relay');
  private readonly kafkaClient = new Kafka({
    clientId: this.kafka.clientId,
    brokers: this.kafka.brokers,
  });
  private readonly maxRetries = Number(process.env.RELAY_MAX_RETRIES ?? 3);
  private readonly retryDelayMs = Number(process.env.RELAY_RETRY_DELAY_MS ?? 5000);
  private producer: KafkaProducerClient | null = null;
  private producerConnectPromise: Promise<void> | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly producerOverride?: KafkaProducerClient,
  ) {}

  async processBatch(limit = 50): Promise<number> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rows = await queryRunner.query(
        `
        SELECT id, event_id, topic, payload, relay_attempts
        FROM outbox_events
        WHERE status = $1
          AND available_at <= now()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2
        `,
        [OUTBOX_STATUS_PENDING, limit],
      );

      let processed = 0;

      for (const row of rows as OutboxRow[]) {
        const attempts = row.relay_attempts + 1;

        try {
          await this.publishEvent(row);

          await queryRunner.query(
            `
            UPDATE outbox_events
            SET status = $1,
                relay_attempts = $2,
                relayed_at = now(),
                last_error = NULL
            WHERE id = $3
            `,
            [OUTBOX_STATUS_RELAYED, attempts, row.id],
          );
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          const exhausted = attempts >= this.maxRetries;
          const nextStatus = exhausted ? OUTBOX_STATUS_FAILED : OUTBOX_STATUS_PENDING;

          await queryRunner.query(
            `
            UPDATE outbox_events
            SET status = $1,
                relay_attempts = $2,
                last_error = $3,
                available_at = CASE WHEN $4 = TRUE THEN available_at ELSE now() + ($5 || ' milliseconds')::interval END
            WHERE id = $6
            `,
            [nextStatus, attempts, detail, exhausted, this.retryDelayMs, row.id],
          );

          this.logger.warn(
            `Relay publish failed for event ${row.event_id}, exhausted=${exhausted}, reason=${detail}`,
          );
        }

        processed += 1;
      }

      await queryRunner.commitTransaction();
      return processed;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async processContinuously(intervalMs = Number(process.env.RELAY_INTERVAL_MS ?? 1000)): Promise<void> {
    await this.processBatch();

    setInterval(() => {
      void this.processBatch().catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error(`Relay cycle failed: ${detail}`);
      });
    }, intervalMs);
  }

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

  private async publishEvent(row: OutboxRow): Promise<void> {
    if (process.env.RELAY_FORCE_FAIL === '1') {
      throw new Error('Forced relay failure for testing');
    }

    const producer = await this.getProducer();
    await producer.send({
      topic: row.topic,
      messages: [
        {
          key: row.event_id,
          value: JSON.stringify(row.payload),
          headers: { eventId: row.event_id },
        },
      ],
    });

    this.logger.log(
      `Published ${row.event_id} to ${row.topic} via brokers ${this.kafka.brokers.join(', ')}`,
    );
  }
}
