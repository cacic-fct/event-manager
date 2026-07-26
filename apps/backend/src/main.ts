/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { createBackendHttpApp, getBackendGlobalPrefix } from './app/bootstrap/backend-http-app';
import { startEventManagerGrpcServer } from './app/grpc/event-manager-grpc.server';

async function bootstrap() {
  const app = await createBackendHttpApp();
  const grpcServer = await startEventManagerGrpcServer(app);
  let shutdownStarted = false;
  let shutdownComplete = false;
  let forceShutdownTimer: ReturnType<typeof setTimeout> | undefined;
  const completeShutdown = () => {
    if (shutdownComplete) {
      return;
    }
    shutdownComplete = true;
    if (forceShutdownTimer) {
      clearTimeout(forceShutdownTimer);
    }
    void app.close().finally(() => process.exit(0));
  };
  const shutdown = (signal: NodeJS.Signals) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    Logger.log(`Received ${signal}; stopping Event Manager gRPC server.`);
    forceShutdownTimer = setTimeout(() => {
      Logger.warn('Event Manager gRPC graceful shutdown timed out; forcing shutdown.');
      grpcServer.forceShutdown();
      completeShutdown();
    }, 10_000);
    forceShutdownTimer.unref();
    grpcServer.tryShutdown(completeShutdown);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${getBackendGlobalPrefix()}`);
}

bootstrap();
