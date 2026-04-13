const DEFAULT_API_PORT = 3000;
const DEFAULT_RELAY_PORT = 3001;

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ServiceRuntimeConfig {
  serviceName: string;
  port: number;
}

export function getServiceRuntimeConfig(serviceName: 'api' | 'relay'): ServiceRuntimeConfig {
  const envKey = serviceName === 'api' ? 'API_PORT' : 'RELAY_PORT';
  const fallback = serviceName === 'api' ? DEFAULT_API_PORT : DEFAULT_RELAY_PORT;

  return {
    serviceName,
    port: readNumber(process.env[envKey], fallback),
  };
}