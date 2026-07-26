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
  const shutdown = (signal: NodeJS.Signals) => {
    Logger.log(`Received ${signal}; stopping Event Manager gRPC server.`);
    grpcServer.tryShutdown(() => {
      void app.close().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${getBackendGlobalPrefix()}`);
}

bootstrap();
