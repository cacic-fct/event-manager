import { Provider } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';

export interface NoopQueue {
  add(name: string, data?: unknown, options?: unknown): Promise<{ id: string; name: string }>;
  upsertJobScheduler(id: string, repeatOptions?: unknown, template?: unknown): Promise<{ id: string; name: string }>;
  close(): Promise<void>;
}

export function createNoopQueueProviders(queueNames: string[]): Provider[] {
  return queueNames.map((queueName) => ({
    provide: getQueueToken(queueName),
    useFactory: () => createNoopQueue(),
  }));
}

function createNoopQueue(): NoopQueue {
  return {
    async add(name: string) {
      return { id: `noop-${name}`, name };
    },
    async upsertJobScheduler(id: string) {
      return { id: `noop-${id}`, name: id };
    },
    async close() {
      return undefined;
    },
  };
}
