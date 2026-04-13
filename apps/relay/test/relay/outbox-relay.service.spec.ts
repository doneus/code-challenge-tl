import { OutboxRelayService } from '../../src/relay/outbox-relay.service';

describe('OutboxRelayService', () => {
  it('marks relay rows as relayed when publish succeeds', async () => {
    const kafkaProducer = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'row-1',
          event_id: 'event-1',
          topic: 'payment.created.v1',
          payload: {},
          relay_attempts: 0,
        },
      ])
      .mockResolvedValueOnce(undefined);

    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query,
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const service = new OutboxRelayService(dataSource as never, kafkaProducer);
    const processed = await service.processBatch(10);

    expect(processed).toBe(1);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET status = $1'),
      expect.arrayContaining(['relayed', 1, 'row-1']),
    );
    expect(kafkaProducer.send).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'payment.created.v1' }),
    );
  });

  it('marks relay rows failed when max retries are exhausted', async () => {
    process.env.RELAY_FORCE_FAIL = '1';
    process.env.RELAY_MAX_RETRIES = '1';

    const kafkaProducer = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'row-1',
          event_id: 'event-1',
          topic: 'payment.created.v1',
          payload: {},
          relay_attempts: 0,
        },
      ])
      .mockResolvedValueOnce(undefined);

    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query,
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const service = new OutboxRelayService(dataSource as never, kafkaProducer);
    const processed = await service.processBatch(10);

    expect(processed).toBe(1);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET status = $1'),
      expect.arrayContaining(['failed', 1]),
    );

    delete process.env.RELAY_FORCE_FAIL;
    delete process.env.RELAY_MAX_RETRIES;
  });

  it('keeps relay rows pending when failure is transient', async () => {
    process.env.RELAY_FORCE_FAIL = '1';
    process.env.RELAY_MAX_RETRIES = '3';

    const kafkaProducer = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'row-1',
          event_id: 'event-1',
          topic: 'payment.created.v1',
          payload: {},
          relay_attempts: 0,
        },
      ])
      .mockResolvedValueOnce(undefined);

    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query,
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const service = new OutboxRelayService(dataSource as never, kafkaProducer);
    const processed = await service.processBatch(10);

    expect(processed).toBe(1);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('available_at = CASE WHEN'),
      expect.arrayContaining(['pending', 1]),
    );

    delete process.env.RELAY_FORCE_FAIL;
    delete process.env.RELAY_MAX_RETRIES;
  });
});
