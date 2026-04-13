import { ConsumerProcessingService } from '../../src/consumers/consumer-processing.service';
import { FraudConsumer } from '../../src/consumers/fraud.consumer';
import { DltPublisher } from '../../src/dlt/dlt.publisher';

describe('ConsumerProcessingService', () => {
  it('returns duplicate when receipt already exists', async () => {
    const receiptRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'r1', deliveryCount: 1 }),
      save: jest.fn().mockImplementation(async (value) => value),
      create: jest.fn((value) => value),
    };
    const ackRepository = {
      save: jest.fn(),
      create: jest.fn((value) => value),
    };
    const dltPublisher = {
      publishPaymentFailed: jest.fn(),
    } as unknown as DltPublisher;

    const service = new ConsumerProcessingService(
      receiptRepository as never,
      ackRepository as never,
      dltPublisher,
    );

    const result = await service.process(
      'fraud',
      {
        eventId: 'e1',
        paymentId: 'p1',
        countryCode: 'PE',
        amount: '10.00',
        currency: 'PEN',
        createdAt: new Date().toISOString(),
      },
      async () => undefined,
    );

    expect(result).toBe('duplicate');
    expect(receiptRepository.save).toHaveBeenCalled();
  });

  it('publishes DLT when retries are exhausted', async () => {
    const receiptRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (value) => value),
      create: jest.fn((value) => value),
    };
    const ackRepository = {
      save: jest.fn().mockImplementation(async (value) => value),
      create: jest.fn((value) => value),
    };
    const dltPublisher = {
      publishPaymentFailed: jest.fn(),
    } as unknown as DltPublisher;

    const service = new ConsumerProcessingService(
      receiptRepository as never,
      ackRepository as never,
      dltPublisher,
    );

    await expect(
      service.process(
        'notify',
        {
          eventId: 'e1',
          paymentId: 'p1',
          countryCode: 'PE',
          amount: '10.00',
          currency: 'PEN',
          createdAt: new Date().toISOString(),
          deliveryAttempt: 3,
          maxRetries: 3,
        },
        async () => {
          throw new Error('notify down');
        },
      ),
    ).rejects.toThrow('notify down');

    expect(dltPublisher.publishPaymentFailed).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'p1', eventId: 'e1', consumerName: 'notify' }),
    );
  });

  it('fails fraud processing only when amount is 13.37', async () => {
    const processingService = {
      process: jest.fn(async (_consumerName, event, sideEffect) => {
        await sideEffect();
        return 'processed' as const;
      }),
    } as unknown as ConsumerProcessingService;

    const fraudConsumer = new FraudConsumer(processingService);

    await expect(
      fraudConsumer.handle({
        eventId: 'e13',
        paymentId: 'p13',
        countryCode: 'PE',
        amount: '13.37',
        currency: 'PEN',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toThrow('Fraud rule rejected payment amount 13.37');

    await expect(
      fraudConsumer.handle({
        eventId: 'e10',
        paymentId: 'p10',
        countryCode: 'PE',
        amount: '10.00',
        currency: 'PEN',
        createdAt: new Date().toISOString(),
      }),
    ).resolves.toBe('processed');
  });
});
