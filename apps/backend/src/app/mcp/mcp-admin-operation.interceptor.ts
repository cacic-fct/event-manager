import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, concatMap, type Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { McpAdminOperationLogService } from './mcp-admin-operation-log.service';
import { mcpIdSchema } from './mcp-admin.schemas';

@Injectable()
export class McpAdminOperationInterceptor implements NestInterceptor {
  constructor(private readonly log: McpAdminOperationLogService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const id = mcpIdSchema.safeParse(request.params['id']);
    const method = context.getHandler().name;
    const logId = await this.log.start({
      tool: `web:${method}`,
      userId: request.user?.sub,
      ...(id.success && method.toLowerCase().includes('proposal') ? { proposalId: id.data } : {}),
      ...(id.success && method.toLowerCase().includes('delegation') ? { delegationId: id.data } : {}),
    });
    return next.handle().pipe(
      concatMap(async (value: unknown) => {
        await this.log.finish(logId, 'SUCCEEDED');
        return value;
      }),
      catchError(async (error: unknown) => {
        await this.log.finish(logId, error instanceof HttpException && error.getStatus() < 500 ? 'DENIED' : 'FAILED');
        throw error;
      }),
    );
  }
}
