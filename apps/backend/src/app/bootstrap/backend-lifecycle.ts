import type { Server } from '@grpc/grpc-js';
import { Logger, type INestApplication } from '@nestjs/common';
import { clearTimeout, setTimeout } from 'node:timers';

const GRPC_SHUTDOWN_TIMEOUT_MS = 10_000;

type GrpcServerLifecycle = Pick<Server, 'forceShutdown' | 'tryShutdown'>;

export async function closeGrpcServer(
  grpcServer: GrpcServerLifecycle,
  timeoutMs = GRPC_SHUTDOWN_TIMEOUT_MS,
): Promise<{ forced: boolean }> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (forced: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve({ forced });
    };
    const timer = setTimeout(() => {
      Logger.warn('Event Manager gRPC graceful shutdown timed out; forcing shutdown.');
      grpcServer.forceShutdown();
      finish(true);
    }, timeoutMs);
    timer.unref();

    try {
      grpcServer.tryShutdown(() => finish(false));
    } catch (error: unknown) {
      Logger.error(
        'Event Manager gRPC graceful shutdown failed; forcing shutdown.',
        error instanceof Error ? error.stack : String(error),
      );
      grpcServer.forceShutdown();
      finish(true);
    }
  });
}

export async function closeBackendResources(
  app: INestApplication | undefined,
  grpcServer: GrpcServerLifecycle | undefined,
): Promise<{ forced: boolean }> {
  let forced = false;
  let cleanupError: unknown;
  if (grpcServer) {
    try {
      forced = (await closeGrpcServer(grpcServer)).forced;
    } catch (error: unknown) {
      cleanupError = error;
    }
  }
  if (app) {
    try {
      await app.close();
    } catch (error: unknown) {
      cleanupError ??= error;
    }
  }
  if (cleanupError) {
    const error = new Error('Backend resource cleanup failed.');
    Object.defineProperty(error, 'cause', { value: cleanupError, configurable: true });
    throw error;
  }
  return { forced };
}
