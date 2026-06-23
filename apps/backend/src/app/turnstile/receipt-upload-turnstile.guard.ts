import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TURNSTILE_ACTIONS, TURNSTILE_TOKEN_HEADER } from '@cacic-fct/shared-utils';
import { TurnstileService } from './turnstile.service';

@Injectable()
export class ReceiptUploadTurnstileGuard implements CanActivate {
  constructor(private readonly turnstile: TurnstileService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    await this.turnstile.assertValidToken(
      this.headerValue(request.headers[TURNSTILE_TOKEN_HEADER]),
      request,
      TURNSTILE_ACTIONS.receiptUpload,
    );

    return true;
  }

  private headerValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }

    return value;
  }
}
