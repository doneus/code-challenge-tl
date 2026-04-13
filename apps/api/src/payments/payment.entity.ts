import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ConsumerAckEntity } from '../consumers/consumer-ack.entity';
import { OutboxEventEntity } from '../outbox/outbox.entity';

export const PAYMENT_STATUS_PENDING = 'pending';
export const PAYMENT_STATUS_SETTLED = 'settled';
export const PAYMENT_STATUS_FAILED = 'failed';

@Entity({ name: 'payments' })
@Index('idx_payments_status_created_at', ['status', 'createdAt'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode!: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 16, default: PAYMENT_STATUS_PENDING })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => OutboxEventEntity, (outboxEvent) => outboxEvent.payment)
  outboxEvents!: OutboxEventEntity[];

  @OneToMany(() => ConsumerAckEntity, (acknowledgement) => acknowledgement.payment)
  acknowledgements!: ConsumerAckEntity[];
}