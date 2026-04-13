import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PaymentEntity } from '../payments/payment.entity';

export const OUTBOX_STATUS_PENDING = 'pending';
export const OUTBOX_STATUS_RELAYED = 'relayed';
export const OUTBOX_STATUS_FAILED = 'failed';

@Entity({ name: 'outbox_events' })
@Index('idx_outbox_status_created_at', ['status', 'createdAt'])
@Index('idx_outbox_payment_id', ['paymentId'])
export class OutboxEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 32, default: 'payment' })
  aggregateType!: string;

  @Column({ name: 'event_id', type: 'uuid', unique: true })
  eventId!: string;

  @Column({ type: 'varchar', length: 128 })
  topic!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: OUTBOX_STATUS_PENDING })
  status!: string;

  @Column({ name: 'relay_attempts', type: 'integer', default: 0 })
  relayAttempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  availableAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'relayed_at', type: 'timestamptz', nullable: true })
  relayedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @ManyToOne(() => PaymentEntity, (payment) => payment.outboxEvents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment!: PaymentEntity;
}