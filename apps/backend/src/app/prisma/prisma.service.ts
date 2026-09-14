import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { audiencePrismaExtension } from '../audiences/audience-prisma.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    super({ adapter });

    const scoped = this.$extends(audiencePrismaExtension);
    return new Proxy(this, {
      get(target, property, receiver) {
        if (Object.prototype.hasOwnProperty.call(PrismaService.prototype, property) && property !== 'constructor') {
          return Reflect.get(target, property, receiver);
        }
        return Reflect.get(scoped, property);
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.once('beforeExit', async () => {
      await app.close();
    });
  }
}
