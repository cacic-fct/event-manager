import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    jest.restoreAllMocks();
  });

  it('connects and disconnects through Nest lifecycle hooks', async () => {
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue();

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('closes the Nest app on Prisma beforeExit', async () => {
    const service = new PrismaService();
    const app = {
      close: jest.fn().mockResolvedValue(undefined),
    };
    let beforeExitHandler: (() => Promise<void>) | undefined;
    const processOnce = jest.spyOn(process, 'once').mockImplementation((event, listener) => {
      if (event === 'beforeExit') {
        beforeExitHandler = listener as () => Promise<void>;
      }

      return process;
    });

    await service.enableShutdownHooks(app as never);
    await beforeExitHandler?.();

    expect(processOnce).toHaveBeenCalledWith('beforeExit', expect.any(Function));
    expect(app.close).toHaveBeenCalledTimes(1);
  });
});
