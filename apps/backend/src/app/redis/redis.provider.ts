import { OnModuleDestroy, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { getRedisConnectionOptions } from '../weather/redis-connection';

export class ManagedRedisClient extends Redis implements OnModuleDestroy {
  constructor() {
    super(getRedisConnectionOptions());
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}

export const redisProvider: Provider<Redis> = {
  provide: Redis,
  useClass: ManagedRedisClient,
};
