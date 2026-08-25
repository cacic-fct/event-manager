import { Logger } from '@nestjs/common';
import { closeBackendResources, closeGrpcServer } from './app/bootstrap/backend-lifecycle';

describe('backend process lifecycle', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('completes a graceful gRPC shutdown without forcing the server', async () => {
    const forceShutdown = jest.fn();
    const server = {
      forceShutdown,
      tryShutdown: jest.fn((callback: () => void) => callback()),
    };

    await expect(closeGrpcServer(server as never, 100)).resolves.toEqual({ forced: false });
    expect(forceShutdown).not.toHaveBeenCalled();
  });

  it('forces a stalled gRPC shutdown and reports the degraded exit condition', async () => {
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const server = {
      forceShutdown: jest.fn(),
      tryShutdown: jest.fn(),
    };

    await expect(closeGrpcServer(server as never, 5)).resolves.toEqual({ forced: true });
    expect(server.forceShutdown).toHaveBeenCalledTimes(1);
  });

  it('forces shutdown when the gRPC implementation throws synchronously', async () => {
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const server = {
      forceShutdown: jest.fn(),
      tryShutdown: jest.fn(() => {
        throw new Error('shutdown failed');
      }),
    };

    await expect(closeGrpcServer(server as never, 100)).resolves.toEqual({ forced: true });
    expect(server.forceShutdown).toHaveBeenCalledTimes(1);
  });

  it('reports application cleanup failures instead of turning them into a successful shutdown', async () => {
    const app = { close: jest.fn().mockRejectedValue(new Error('HTTP close failed')) };
    const server = {
      forceShutdown: jest.fn(),
      tryShutdown: jest.fn((callback: () => void) => callback()),
    };

    await expect(closeBackendResources(app as never, server as never)).rejects.toThrow(
      'Backend resource cleanup failed',
    );
    expect(app.close).toHaveBeenCalledTimes(1);
  });
});
