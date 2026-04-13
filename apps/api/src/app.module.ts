import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseConfig } from '@app/shared/config/database.config';
import { ConsumerAckEntity } from './consumers/consumer-ack.entity';
import { ConsumerProcessingService } from './consumers/consumer-processing.service';
import { ConsumerReceiptEntity } from './consumers/consumer-receipt.entity';
import { FraudConsumer } from './consumers/fraud.consumer';
import { KafkaConsumerRunnerService } from './consumers/kafka-consumer-runner.service';
import { LedgerConsumer } from './consumers/ledger.consumer';
import { NotifyConsumer } from './consumers/notify.consumer';
import { DltPublisher } from './dlt/dlt.publisher';
import { OutboxEventEntity } from './outbox/outbox.entity';
import { PaymentController } from './payments/payment.controller';
import { PaymentEntity } from './payments/payment.entity';
import { PaymentService } from './payments/payment.service';
import { StatusQueryService } from './payments/status-query.service';

const entities = [PaymentEntity, OutboxEventEntity, ConsumerReceiptEntity, ConsumerAckEntity];

@Module({
  controllers: [PaymentController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => createDatabaseConfig(entities),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  providers: [
    PaymentService,
    StatusQueryService,
    DltPublisher,
    ConsumerProcessingService,
    KafkaConsumerRunnerService,
    FraudConsumer,
    LedgerConsumer,
    NotifyConsumer,
  ],
})
export class AppModule {}