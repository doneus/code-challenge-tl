import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init00011744500000000 implements MigrationInterface {
  name = 'Init00011744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "country_code" character varying(2) NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "currency" character varying(3) NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL,
        "aggregate_type" character varying(32) NOT NULL DEFAULT 'payment',
        "event_id" uuid NOT NULL,
        "topic" character varying(128) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "relay_attempts" integer NOT NULL DEFAULT 0,
        "available_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "relayed_at" TIMESTAMPTZ,
        "last_error" text,
        CONSTRAINT "PK_outbox_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_outbox_events_event_id" UNIQUE ("event_id"),
        CONSTRAINT "FK_outbox_events_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "consumer_receipts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "consumer_name" character varying(32) NOT NULL,
        "event_id" uuid NOT NULL,
        "payment_id" uuid NOT NULL,
        "delivery_count" integer NOT NULL DEFAULT 1,
        "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consumer_receipts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consumer_receipts_consumer_event" UNIQUE ("consumer_name", "event_id"),
        CONSTRAINT "FK_consumer_receipts_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "consumer_acknowledgements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "payment_id" uuid NOT NULL,
        "consumer_name" character varying(32) NOT NULL,
        "event_id" uuid NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "error_code" character varying(64),
        "error_detail" text,
        "acknowledged_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consumer_acknowledgements_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consumer_ack_payment_consumer" UNIQUE ("payment_id", "consumer_name"),
        CONSTRAINT "FK_consumer_ack_payment_id" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "idx_payments_status_created_at" ON "payments" ("status", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_outbox_status_created_at" ON "outbox_events" ("status", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_outbox_payment_id" ON "outbox_events" ("payment_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_consumer_receipts_payment_id" ON "consumer_receipts" ("payment_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_consumer_ack_status" ON "consumer_acknowledgements" ("status")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_consumer_ack_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_consumer_receipts_payment_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_outbox_payment_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_outbox_status_created_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_payments_status_created_at"');
    await queryRunner.query('DROP TABLE IF EXISTS "consumer_acknowledgements"');
    await queryRunner.query('DROP TABLE IF EXISTS "consumer_receipts"');
    await queryRunner.query('DROP TABLE IF EXISTS "outbox_events"');
    await queryRunner.query('DROP TABLE IF EXISTS "payments"');
  }
}