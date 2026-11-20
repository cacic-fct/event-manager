import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

export type McpAuthenticatedRequest = AuthenticatedRequest & { user: AuthenticatedUser };

export function mcpUserId(user: AuthenticatedUser): string {
  if (!user.sub) throw new UnauthorizedException('Usuário autenticado inválido.');
  return user.sub;
}
