import { randomUUID } from 'node:crypto';
import {
  CONSUMER_ACK_FAILED,
  CONSUMER_ACK_SUCCEEDED,
  ConsumerAckEntity,
} from '../apps/api/src/consumers/consumer-ack.entity';
import {
  CONSUMER_NAME_FRAUD,
  CONSUMER_NAME_LEDGER,
  CONSUMER_NAME_NOTIFY,
  ConsumerReceiptEntity,
} from '../apps/api/src/consumers/consumer-receipt.entity';
import { ConsumerProcessingService } from '../apps/api/src/consumers/consumer-processing.service';
import { DltPublisher } from '../apps/api/src/dlt/dlt.publisher';
import { OutboxEventEntity } from '../apps/api/src/outbox/outbox.entity';
import { PaymentEntity } from '../apps/api/src/payments/payment.entity';
import { PaymentService } from '../apps/api/src/payments/payment.service';
import { StatusQueryService } from '../apps/api/src/payments/status-query.service';
import { OutboxRelayService } from '../apps/relay/src/relay/outbox-relay.service';

type OutboxRow = {
  id: string;
  paymentId: string;
  eventId: string;
  topic: string;
  payload: Record<string, unknown>;
  status: string;
  relayAttempts: number;
  createdAt: Date;
  availableAt: Date;
  relayedAt: Date | null;
  lastError: string | null;
};

function createInMemoryStores() {
  const payments = new Map<string, PaymentEntity>();
  const outbox = new Map<string, OutboxRow>();
  const receipts = new Map<string, ConsumerReceiptEntity>();
  const acks = new Map<string, ConsumerAckEntity>();
  const dltMessages: Array<Record<string, unknown>> = [];
  const publishedMessages: Array<{ topic: string; key?: string; value?: string }> = [];

  const paymentRepository = {
    findOne: jest.fn(async ({ where: { id } }: { where: { id: string } }) => payments.get(id) ?? null),
  };

  const ackRepository = {
    find: jest.fn(async ({ where: { paymentId } }: { where: { paymentId: string } }) =>
      [...acks.values()]
        .filter((ack) => ack.paymentId === paymentId)
        .sort((left, right) => left.consumerName.localeCompare(right.consumerName)),
    ),
    save: jest.fn(async (ack: ConsumerAckEntity) => {
      const key = `${ack.paymentId}:${ack.consumerName}`;
      const previous = acks.get(key);
      const next = {
        ...previous,
        ...ack,
      } as ConsumerAckEntity;

      acks.set(key, next);
      return next;
    }),
    create: jest.fn((payload: ConsumerAckEntity) => payload),
  };

  const receiptRepository = {
    findOne: jest.fn(
      async ({ where: { consumerName, eventId } }: { where: { consumerName: string; eventId: string } }) =>
        receipts.get(`${consumerName}:${eventId}`) ?? null,
    ),
    save: jest.fn(async (receipt: ConsumerReceiptEntity) => {
      const key = `${receipt.consumerName}:${receipt.eventId}`;
      receipts.set(key, receipt);
      return receipt;
    }),
    create: jest.fn((payload: ConsumerReceiptEntity) => payload),
  };

  const dltPublisher: DltPublisher = {
    publishPaymentFailed: jest.fn(async (payload: Record<string, unknown>) => {
      dltMessages.push(payload);
    }),
  } as unknown as DltPublisher;

  const kafkaProducer = {
    send: jest.fn(async (record: { topic: string; messages: Array<{ key?: string; value?: string }> }) => {
      const [firstMessage] = record.messages;
      publishedMessages.push({
        topic: record.topic,
        key: firstMessage?.key,
        value: firstMessage?.value,
      });
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (work: (manager: any) => Promise<unknown>) => {
      const manager = {
        create: jest.fn((_entity: unknown, payload: Record<string, unknown>) => payload),
        save: jest.fn(async (entity: unknown, payload: Record<string, unknown>) => {
          if (entity === PaymentEntity) {
            const payment: PaymentEntity = {
              id: randomUUID(),
              countryCode: payload.countryCode as string,
              amount: payload.amount as string,
              currency: payload.currency as string,
              status: payload.status as string,
              createdAt: new Date(),
              updatedAt: new Date(),
              outboxEvents: [],
              acknowledgements: [],
            };

            payments.set(payment.id, payment);
            return payment;
          }

          if (entity === OutboxEventEntity) {
            const row: OutboxRow = {
              id: randomUUID(),
              paymentId: payload.paymentId as string,
              eventId: payload.eventId as string,
              topic: payload.topic as string,
              payload: payload.payload as Record<string, unknown>,
              status: payload.status as string,
              relayAttempts: 0,
              createdAt: new Date(),
              availableAt: new Date(),
              relayedAt: null,
              lastError: null,
            };

            outbox.set(row.id, row);
            return row;
          }

          throw new Error('Unsupported entity save operation');
        }),
      };

      return work(manager);
    }),
    createQueryRunner: jest.fn(() => {
      return {
        connect: jest.fn(async () => undefined),
        startTransaction: jest.fn(async () => undefined),
        commitTransaction: jest.fn(async () => undefined),
        rollbackTransaction: jest.fn(async () => undefined),
        release: jest.fn(async () => undefined),
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (sql.includes('SELECT id, event_id, topic, payload, relay_attempts')) {
            const status = params[0] as string;
            const limit = params[1] as number;

            return [...outbox.values()]
              .filter((row) => row.status === status)
              .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
              .slice(0, limit)
              .map((row) => ({
                id: row.id,
                event_id: row.eventId,
                topic: row.topic,
                payload: row.payload,
                relay_attempts: row.relayAttempts,
              }));
          }

          if (sql.includes('SET status = $1,') && sql.includes('relayed_at = now()')) {
            const [status, attempts, id] = params as [string, number, string];
            const row = outbox.get(id);

            if (!row) {
              throw new Error(`Outbox row ${id} not found`);
            }

            row.status = status;
            row.relayAttempts = attempts;
            row.relayedAt = new Date();
            row.lastError = null;
            return;
          }

          if (sql.includes('available_at = CASE WHEN')) {
            const [status, attempts, detail, _exhausted, _delay, id] = params as [
              string,
              number,
              string,
              boolean,
              number,
              string,
            ];
            const row = outbox.get(id);

            if (!row) {
              throw new Error(`Outbox row ${id} not found`);
            }

            row.status = status;
            row.relayAttempts = attempts;
            row.lastError = detail;
            return;
          }

          throw new Error(`Unsupported query: ${sql}`);
        }),
      };
    }),
  };

  return {
    stores: {
      payments,
      outbox,
      receipts,
      acks,
      dltMessages,
      publishedMessages,
    },
    repos: {
      paymentRepository,
      ackRepository,
      receiptRepository,
    },
    dependencies: {
      dataSource,
      dltPublisher,
      kafkaProducer,
    },
  };
}

describe('Challenge 1 integration flow', () => {
  it('covers accepted payment, relay, duplicate redelivery, retry exhaustion, and settlement with notify failure', async () => {
    const {
      stores,
      repos,
      dependencies: { dataSource, dltPublisher, kafkaProducer },
    } = createInMemoryStores();

    const paymentService = new PaymentService(dataSource as never);
    const relayService = new OutboxRelayService(dataSource as never, kafkaProducer as never);
    const consumerProcessing = new ConsumerProcessingService(
      repos.receiptRepository as never,
      repos.ackRepository as never,
      dltPublisher,
    );
    const statusService = new StatusQueryService(
      repos.paymentRepository as never,
      repos.ackRepository as never,
    );

    const accepted = await paymentService.createPayment({
      countryCode: 'pe',
      amount: '99.50',
      currency: 'pen',
    });

    expect(accepted.status).toBe('pending');
    expect(stores.payments.has(accepted.paymentId)).toBe(true);
    expect([...stores.outbox.values()]).toHaveLength(1);

    const relayedCount = await relayService.processBatch(10);
    expect(relayedCount).toBe(1);

    const outboxRow = [...stores.outbox.values()][0];
    expect(outboxRow.status).toBe('relayed');
    expect(outboxRow.eventId).toBe(accepted.eventId);
    expect(stores.publishedMessages).toHaveLength(1);

    const event = {
      eventId: accepted.eventId,
      paymentId: accepted.paymentId,
      countryCode: 'PE',
      amount: '99.50',
      currency: 'PEN',
      createdAt: new Date().toISOString(),
    };

    await consumerProcessing.process(CONSUMER_NAME_FRAUD, event, async () => undefined);
    const duplicate = await consumerProcessing.process(CONSUMER_NAME_FRAUD, event, async () => undefined);
    expect(duplicate).toBe('duplicate');

    await consumerProcessing.process(CONSUMER_NAME_LEDGER, event, async () => undefined);

    await expect(
      consumerProcessing.process(
        CONSUMER_NAME_NOTIFY,
        {
          ...event,
          deliveryAttempt: 3,
          maxRetries: 3,
        },
        async () => {
          throw new Error('notify unavailable');
        },
      ),
    ).rejects.toThrow('notify unavailable');

    expect((dltPublisher.publishPaymentFailed as jest.Mock).mock.calls).toHaveLength(1);

    const status = await statusService.getPaymentStatus(accepted.paymentId);
    expect(status.status).toBe('settled');

    const fraudAck = status.acknowledgements.find((ack) => ack.consumerName === CONSUMER_NAME_FRAUD);
    const ledgerAck = status.acknowledgements.find((ack) => ack.consumerName === CONSUMER_NAME_LEDGER);
    const notifyAck = status.acknowledgements.find((ack) => ack.consumerName === CONSUMER_NAME_NOTIFY);

    expect(fraudAck?.status).toBe(CONSUMER_ACK_SUCCEEDED);
    expect(ledgerAck?.status).toBe(CONSUMER_ACK_SUCCEEDED);
    expect(notifyAck?.status).toBe(CONSUMER_ACK_FAILED);
    expect(status.consistency).toBe('eventual');
  });
});
