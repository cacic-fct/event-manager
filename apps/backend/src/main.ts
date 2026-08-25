/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, type INestApplication } from '@nestjs/common';
import type { Server } from '@grpc/grpc-js';
import { convertLegacyEventDescriptionsCommand } from './app/events/convert-legacy-event-descriptions.command';
import { closeBackendResources } from './app/bootstrap/backend-lifecycle';

const CONVERT_LEGACY_EVENT_DESCRIPTIONS_COMMAND = 'convert-legacy-event-descriptions';
async function bootstrap() {
  const [{ createBackendHttpApp, getBackendGlobalPrefix }, { startEventManagerGrpcServer }] = await Promise.all([
    import('./app/bootstrap/backend-http-app.js'),
    import('./app/grpc/event-manager-grpc.server.js'),
  ]);
  let app: INestApplication | undefined;
  let grpcServer: Server | undefined;
  let shutdownStarted = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    Logger.log(`Received ${signal}; stopping Event Manager gRPC server.`);
    void closeBackendResources(app, grpcServer)
      .then(({ forced }) => process.exit(forced ? 1 : 0))
      .catch((error: unknown) => {
        Logger.error('Backend shutdown failed.', error instanceof Error ? error.stack : String(error));
        process.exit(1);
      });
  };
  try {
    app = await createBackendHttpApp();
    grpcServer = await startEventManagerGrpcServer(app);
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    const port = process.env.PORT || 3000;
    await app.listen(port);
    Logger.log(`🚀 Application is running on: http://localhost:${port}/${getBackendGlobalPrefix()}`);
  } catch (error: unknown) {
    try {
      await closeBackendResources(app, grpcServer);
    } catch (cleanupError: unknown) {
      Logger.error(
        'Backend startup rollback failed.',
        cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
      );
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === CONVERT_LEGACY_EVENT_DESCRIPTIONS_COMMAND) {
    await convertLegacyEventDescriptionsCommand(args);
    return;
  }
  if (command) {
    throw new Error(`Unknown backend command: ${command}`);
  }

  await bootstrap();
}

void main().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.stack : 'Unexpected backend startup failure.');
  process.exitCode = 1;
});
