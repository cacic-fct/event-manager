import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { createAllowedPostLogoutRedirectOrigins } from '../auth-redirect-utils';

@Injectable()
export class LogoutOriginGuard implements CanActivate {
  private readonly logger = new Logger(LogoutOriginGuard.name);
  private readonly allowedOrigins = createAllowedPostLogoutRedirectOrigins(process.env, this.logger);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;

    if (typeof origin !== 'string' || !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException('Invalid logout origin.');
    }

    return true;
  }
}
