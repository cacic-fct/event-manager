import { Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../weather/redis-connection';
import { InMemoryRedisClient } from './in-memory-redis-client';

export class ManagedRedisClient extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(ManagedRedisClient.name);

  constructor() {
    super(getRedisConnectionOptions());
    this.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}

export const redisProvider: Provider<Redis> = {
  provide: Redis,
  useFactory: () =>
    process.env.BACKEND_E2E_IN_MEMORY_INFRA === 'true'
      ? (new InMemoryRedisClient() as unknown as Redis)
      : new ManagedRedisClient(),
};
