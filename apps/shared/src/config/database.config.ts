import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'node:path';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createDatabaseConfig(entities: EntityClassOrSchema[]): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: readNumber(process.env.DB_PORT, 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'payments',
    entities,
    migrations: [join(process.cwd(), 'apps/api/src/database/migrations/*{.ts,.js}')],
    synchronize: false,
    logging: false,
  };
}