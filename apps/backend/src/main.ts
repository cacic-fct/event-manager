/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { createBackendHttpApp, getBackendGlobalPrefix } from './app/bootstrap/backend-http-app';
import { startEventManagerGrpcServer } from './app/grpc/event-manager-grpc.server';

async function bootstrap() {
  const app = await createBackendHttpApp();
  await startEventManagerGrpcServer(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${getBackendGlobalPrefix()}`);
}

bootstrap();
