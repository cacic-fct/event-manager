import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface';

export function isUserOnboarded(user: AuthenticatedUser): boolean {
  const claim = user.claims['is_onboarded'];
  return claim === true || claim === 'true';
}

export function assertUserOnboarded(user: AuthenticatedUser): void {
  if (!isUserOnboarded(user)) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'ONBOARDING_REQUIRED',
      message: 'Complete seu cadastro para continuar.',
    });
  }
}
