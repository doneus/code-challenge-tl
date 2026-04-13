import { DltPublisher } from '../../src/dlt/dlt.publisher';

describe('DltPublisher', () => {
  it('publishes failed event payload to dead-letter topic', async () => {
    const producer = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const publisher = new DltPublisher(producer as never);

    await publisher.publishPaymentFailed({
      paymentId: 'p1',
      eventId: 'e1',
      consumerName: 'notify',
      reason: 'notify down',
    });

    expect(producer.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'payment.failed.v1',
        messages: [
          expect.objectContaining({
            key: 'e1',
          }),
        ],
      }),
    );
  });

  it('disconnects producer on module destroy', async () => {
    const producer = {
      send: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const publisher = new DltPublisher(producer as never);

    await publisher.publishPaymentFailed({
      paymentId: 'p1',
      eventId: 'e1',
      consumerName: 'notify',
      reason: 'notify down',
    });

    await publisher.onModuleDestroy();

    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });
});