export interface KafkaRuntimeConfig {
  brokers: string[];
  clientId: string;
  paymentCreatedTopic: string;
  deadLetterTopic: string;
}

export function getKafkaRuntimeConfig(clientId: string): KafkaRuntimeConfig {
  return {
    brokers: (process.env.KAFKA_BROKERS ?? '127.0.0.1:19092')
      .split(',')
      .map((broker: string) => broker.trim())
      .filter(Boolean),
    clientId,
    paymentCreatedTopic: process.env.PAYMENT_CREATED_TOPIC ?? 'payment.created.v1',
    deadLetterTopic: process.env.PAYMENT_DLT_TOPIC ?? 'payment.failed.v1',
  };
}