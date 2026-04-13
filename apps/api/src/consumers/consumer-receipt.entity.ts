import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const CONSUMER_NAME_FRAUD = 'fraud';
export const CONSUMER_NAME_LEDGER = 'ledger';
export const CONSUMER_NAME_NOTIFY = 'notify';

@Entity({ name: 'consumer_receipts' })
@Index('uq_consumer_receipts_consumer_event', ['consumerName', 'eventId'], { unique: true })
@Index('idx_consumer_receipts_payment_id', ['paymentId'])
export class ConsumerReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'consumer_name', type: 'varchar', length: 32 })
  consumerName!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'delivery_count', type: 'integer', default: 1 })
  deliveryCount!: number;

  @CreateDateColumn({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt!: Date;

  @UpdateDateColumn({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;
}