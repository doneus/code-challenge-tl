import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createDatabaseConfig } from '@app/shared/config/database.config';
import { ConsumerAckEntity } from '../consumers/consumer-ack.entity';
import { ConsumerReceiptEntity } from '../consumers/consumer-receipt.entity';
import { OutboxEventEntity } from '../outbox/outbox.entity';
import { PaymentEntity } from '../payments/payment.entity';

const entities = [PaymentEntity, OutboxEventEntity, ConsumerReceiptEntity, ConsumerAckEntity];

async function runMigrations(): Promise<void> {
  const options = createDatabaseConfig(entities);
  const dataSource = new DataSource(options as never);

  await dataSource.initialize();

  try {
    const migrations = await dataSource.runMigrations();
    if (migrations.length === 0) {
      // Keep output concise but explicit for local debugging.
      console.log('No pending migrations.');
      return;
    }

    console.log(`Applied ${migrations.length} migration(s).`);
  } finally {
    await dataSource.destroy();
  }
}

void runMigrations().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`Migration failed: ${detail}`);
  process.exitCode = 1;
});