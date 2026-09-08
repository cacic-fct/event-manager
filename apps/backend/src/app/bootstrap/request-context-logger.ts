import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { currentRequestId } from './request-context';

/** Adds correlation to existing Nest diagnostics without inspecting request data. */
export class RequestContextLogger extends ConsoleLogger {
  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    const requestId = currentRequestId();
    super.printMessages(
      requestId ? messages.map((message) => ({ requestId, message })) : messages,
      context,
      logLevel,
      writeStreamType,
      errorStack,
    );
  }
}
