import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentEntity } from '../payments/payment.entity';

export const CONSUMER_ACK_PENDING = 'pending';
export const CONSUMER_ACK_SUCCEEDED = 'succeeded';
export const CONSUMER_ACK_FAILED = 'failed';

@Entity({ name: 'consumer_acknowledgements' })
@Index('uq_consumer_ack_payment_consumer', ['paymentId', 'consumerName'], { unique: true })
@Index('idx_consumer_ack_status', ['status'])
export class ConsumerAckEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'consumer_name', type: 'varchar', length: 32 })
  consumerName!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ type: 'varchar', length: 16, default: CONSUMER_ACK_PENDING })
  status!: string;

  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_detail', type: 'text', nullable: true })
  errorDetail!: string | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => PaymentEntity, (payment) => payment.acknowledgements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment!: PaymentEntity;
}