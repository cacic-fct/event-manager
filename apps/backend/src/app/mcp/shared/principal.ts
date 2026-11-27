import type { Prisma } from '@prisma/client';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/authenticated-request';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

export type McpAuthenticatedRequest = AuthenticatedRequest & { user: AuthenticatedUser };

export function mcpUserId(user: AuthenticatedUser): string {
  if (!user.sub) throw new UnauthorizedException('Usuário autenticado inválido.');
  return user.sub;
}

export async function assertMcpAccountEligible(
  user: AuthenticatedUser,
  db: Pick<Prisma.TransactionClient, 'people'>,
): Promise<void> {
  if (!user.sub) throw new ForbiddenException('Usuário MCP inválido.');
  const people = await db.people.findMany({
    where: { userId: user.sub },
    select: { deletedAt: true, lgpdDeletionRequestId: true },
    take: 2,
  });
  if (people.length !== 1 || people[0].deletedAt || people[0].lgpdDeletionRequestId) {
    throw new ForbiddenException('O MCP exige uma pessoa ativa vinculada à conta, sem exclusão pendente.');
  }
}

export function withoutMcpBearer(user: AuthenticatedUser): AuthenticatedUser {
  return { ...user, token: '', authenticationTransport: 'mcp' };
}
