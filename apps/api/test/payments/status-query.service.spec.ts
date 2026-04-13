import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumerAckEntity } from '../../src/consumers/consumer-ack.entity';
import { PaymentEntity } from '../../src/payments/payment.entity';
import { StatusQueryService } from '../../src/payments/status-query.service';

describe('StatusQueryService', () => {
  let service: StatusQueryService;
  let paymentRepository: jest.Mocked<Repository<PaymentEntity>>;
  let ackRepository: jest.Mocked<Repository<ConsumerAckEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StatusQueryService,
        {
          provide: getRepositoryToken(PaymentEntity),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(ConsumerAckEntity),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(StatusQueryService);
    paymentRepository = moduleRef.get(getRepositoryToken(PaymentEntity));
    ackRepository = moduleRef.get(getRepositoryToken(ConsumerAckEntity));
  });

  it('returns settled when fraud and ledger succeeded', async () => {
    paymentRepository.findOne.mockResolvedValue({ id: 'p1', status: 'pending' } as PaymentEntity);
    ackRepository.find.mockResolvedValue([
      {
        paymentId: 'p1',
        consumerName: 'fraud',
        status: 'succeeded',
        eventId: 'e1',
        acknowledgedAt: new Date('2026-04-12T00:00:00.000Z'),
        errorCode: null,
      },
      {
        paymentId: 'p1',
        consumerName: 'ledger',
        status: 'succeeded',
        eventId: 'e1',
        acknowledgedAt: new Date('2026-04-12T00:00:01.000Z'),
        errorCode: null,
      },
      {
        paymentId: 'p1',
        consumerName: 'notify',
        status: 'failed',
        eventId: 'e1',
        acknowledgedAt: new Date('2026-04-12T00:00:02.000Z'),
        errorCode: 'SMTP',
      },
    ] as ConsumerAckEntity[]);

    const result = await service.getPaymentStatus('p1');

    expect(result.status).toBe('settled');
  });

  it('returns pending when required acknowledgements are incomplete', async () => {
    paymentRepository.findOne.mockResolvedValue({ id: 'p1', status: 'pending' } as PaymentEntity);
    ackRepository.find.mockResolvedValue([
      {
        paymentId: 'p1',
        consumerName: 'fraud',
        status: 'succeeded',
        eventId: 'e1',
        acknowledgedAt: new Date('2026-04-12T00:00:00.000Z'),
        errorCode: null,
      },
    ] as ConsumerAckEntity[]);

    const result = await service.getPaymentStatus('p1');

    expect(result.status).toBe('pending');
  });

  it('returns failed when a required acknowledgement failed', async () => {
    paymentRepository.findOne.mockResolvedValue({ id: 'p1', status: 'pending' } as PaymentEntity);
    ackRepository.find.mockResolvedValue([
      {
        paymentId: 'p1',
        consumerName: 'fraud',
        status: 'failed',
        eventId: 'e1',
        acknowledgedAt: new Date('2026-04-12T00:00:00.000Z'),
        errorCode: 'RETRY_EXHAUSTED',
      },
      {
        paymentId: 'p1',
        consumerName: 'ledger',
        status: 'succeeded',
        eventId: 'e1',
        acknowledgedAt: new Date('2026-04-12T00:00:01.000Z'),
        errorCode: null,
      },
    ] as ConsumerAckEntity[]);

    const result = await service.getPaymentStatus('p1');

    expect(result.status).toBe('failed');
  });

  it('throws when payment does not exist', async () => {
    paymentRepository.findOne.mockResolvedValue(null);

    await expect(service.getPaymentStatus('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
