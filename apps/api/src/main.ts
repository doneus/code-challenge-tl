import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getServiceRuntimeConfig } from '@app/shared/config/runtime.config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const runtime = getServiceRuntimeConfig('api');
  const app = await NestFactory.create(AppModule);

  await app.listen(runtime.port);

  Logger.log(`API runtime listening on port ${runtime.port}`, runtime.serviceName);
}

void bootstrap();