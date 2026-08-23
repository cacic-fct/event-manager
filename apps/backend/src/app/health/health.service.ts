import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export type HealthStatus = {
  status: 'ok';
  checks?: {
    database: 'up';
    redis: 'up';
  };
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
  ) {}

  live(): HealthStatus {
    return { status: 'ok' };
  }

  async ready(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.withTimeout(this.prisma.$queryRaw`SELECT 1`, 'database'),
      this.withTimeout(this.redis.ping(), 'redis'),
    ]);
    const failed = checks.flatMap((result, index) =>
      result.status === 'rejected' ? [index === 0 ? 'database' : 'redis'] : [],
    );
    if (failed.length > 0) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        failed,
      });
    }

    return {
      status: 'ok',
      checks: {
        database: 'up',
        redis: 'up',
      },
    };
  }

  private async withTimeout<T>(operation: Promise<T>, dependency: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${dependency} health check timed out.`)),
            HEALTH_CHECK_TIMEOUT_MS,
          );
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
