import { Test } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentService } from '../../src/payments/payment.service';
import { OutboxEventEntity } from '../../src/outbox/outbox.entity';
import { PaymentEntity } from '../../src/payments/payment.entity';

describe('PaymentService', () => {
  it('creates payment and outbox in one transaction', async () => {
    const savedPayment = {
      id: 'payment-1',
      countryCode: 'PE',
      amount: '10.00',
      currency: 'PEN',
      status: 'pending',
      createdAt: new Date('2026-04-12T00:00:00.000Z'),
    } as PaymentEntity;

    const manager = {
      create: jest.fn((entity: unknown, payload: Record<string, unknown>) => payload),
      save: jest.fn(async (entity: unknown, payload: Record<string, unknown>) => {
        if (entity === PaymentEntity) {
          return savedPayment;
        }

        return payload as unknown as OutboxEventEntity;
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(async (work: (em: EntityManager) => Promise<unknown>) => work(manager)),
    } as unknown as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    const service = moduleRef.get(PaymentService);

    const result = await service.createPayment({
      countryCode: 'pe',
      amount: '10.00',
      currency: 'pen',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      PaymentEntity,
      expect.objectContaining({ countryCode: 'PE', currency: 'PEN' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      OutboxEventEntity,
      expect.objectContaining({ paymentId: 'payment-1', topic: 'payment.created.v1' }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        paymentId: 'payment-1',
        status: 'pending',
      }),
    );
  });

  it('does not create outbox when intake transaction fails', async () => {
    const manager = {
      create: jest.fn((entity: unknown, payload: Record<string, unknown>) => payload),
      save: jest.fn(async (entity: unknown) => {
        if (entity === PaymentEntity) {
          throw new Error('commit failed');
        }

        return { id: 'outbox-1' } as unknown as OutboxEventEntity;
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest.fn(async (work: (em: EntityManager) => Promise<unknown>) => work(manager)),
    } as unknown as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    const service = moduleRef.get(PaymentService);

    await expect(
      service.createPayment({
        countryCode: 'pe',
        amount: '10.00',
        currency: 'pen',
      }),
    ).rejects.toThrow('commit failed');

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      PaymentEntity,
      expect.objectContaining({ countryCode: 'PE', currency: 'PEN' }),
    );
    expect(manager.save).not.toHaveBeenCalledWith(OutboxEventEntity, expect.anything());
  });
});
