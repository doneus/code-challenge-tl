import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getKafkaRuntimeConfig } from '@app/shared/config/kafka.config';
import { getServiceRuntimeConfig } from '@app/shared/config/runtime.config';
import { OutboxRelayService } from './relay/outbox-relay.service';
import { RelayModule } from './relay.module';

async function bootstrap(): Promise<void> {
  const runtime = getServiceRuntimeConfig('relay');
  const kafka = getKafkaRuntimeConfig('relay-runtime');
  const app = await NestFactory.createApplicationContext(RelayModule);
  const relayService = app.get(OutboxRelayService);

  app.enableShutdownHooks();
  await relayService.processContinuously();

  Logger.log(
    `Relay runtime booted with brokers ${kafka.brokers.join(', ')}`,
    runtime.serviceName,
  );
}

void bootstrap();