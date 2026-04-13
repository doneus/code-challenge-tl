import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseConfig } from '@app/shared/config/database.config';
import { ConsumerAckEntity } from '../../api/src/consumers/consumer-ack.entity';
import { ConsumerReceiptEntity } from '../../api/src/consumers/consumer-receipt.entity';
import { OutboxEventEntity } from '../../api/src/outbox/outbox.entity';
import { PaymentEntity } from '../../api/src/payments/payment.entity';
import { OutboxRelayService } from './relay/outbox-relay.service';

const entities = [PaymentEntity, OutboxEventEntity, ConsumerReceiptEntity, ConsumerAckEntity];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => createDatabaseConfig(entities),
    }),
    TypeOrmModule.forFeature([OutboxEventEntity]),
  ],
  providers: [OutboxRelayService],
  exports: [OutboxRelayService],
})
export class RelayModule {}