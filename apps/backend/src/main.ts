/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { convertLegacyEventDescriptionsCommand } from './app/events/convert-legacy-event-descriptions.command';

const CONVERT_LEGACY_EVENT_DESCRIPTIONS_COMMAND = 'convert-legacy-event-descriptions';

async function bootstrap() {
  const [{ createBackendHttpApp, getBackendGlobalPrefix }, { startEventManagerGrpcServer }] =
    await Promise.all([
      import('./app/bootstrap/backend-http-app.js'),
      import('./app/grpc/event-manager-grpc.server.js'),
    ]);
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
  Logger.error(error instanceof Error ? error.message : 'Unexpected backend startup failure.');
  process.exitCode = 1;
});
