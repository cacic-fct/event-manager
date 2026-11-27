import type { AdminMcpScope } from '@cacic-fct/event-manager-mcp-contracts';
import type { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuthorizationPolicyService,
  type AuthorizationResourceContext,
} from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminMcpOperation } from './catalog';

export function argumentValues(input: unknown, path: string): string[] {
  let values: unknown[] = [input];
  for (const segment of path.split('.')) {
    const array = segment.endsWith('[]');
    const key = array ? segment.slice(0, -2) : segment;
    values = values.flatMap((value) => {
      if (typeof value !== 'object' || value === null) {
        return [];
      }
      const next: unknown = Reflect.get(value, key);
      return array ? (Array.isArray(next) ? next : []) : [next];
    });
  }
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function operationContexts(
  operation: AdminMcpOperation,
  args: Record<string, unknown>,
  policy: AuthorizationPolicyService,
): AuthorizationResourceContext[] {
  if (operation.target === 'GLOBAL' || operation.target.mode !== 'ARGUMENTS') {
    return [];
  }
  const base = policy.buildResourceContext(args, operation.permissions);
  return operation.target.paths.flatMap((path) =>
    argumentValues(args, path.argument).map((id) => ({
      primaryResource: base.primaryResource,
      [path.context]: id,
    })),
  );
}

@Injectable()
export class AdminMcpScopePolicy {
  constructor(
    private readonly policy: AuthorizationPolicyService,
    private readonly prisma: PrismaService,
  ) {}

  async operation(scope: AdminMcpScope, operation: AdminMcpOperation, args: Record<string, unknown>): Promise<void> {
    if (scope.mode === 'ALL_AUTHORIZED') {
      return;
    }
    const contexts = operationContexts(operation, args, this.policy);
    if (!contexts.length) {
      throw new ForbiddenException('Esta operação exige delegação explícita para todos os recursos já permitidos.');
    }
    for (const context of contexts) {
      await this.assert(scope, operation.permissions, context);
    }
  }

  async assert(
    scope: AdminMcpScope,
    permissions: readonly Permission[],
    context: AuthorizationResourceContext,
  ): Promise<void> {
    if (scope.mode === 'ALL_AUTHORIZED') {
      return;
    }
    const targets = await this.policy.resolveOperationTargets(permissions, context);
    const events = [...targets.eventIds];
    const groups = [...targets.eventGroupIds];
    const majors = [...targets.majorEventIds];
    if (!events.length && !groups.length && !majors.length) {
      throw new ForbiddenException('Destino sem vínculo com o escopo delegado.');
    }
    if (scope.kind === 'EVENT') {
      if (events.length !== 1 || events[0] !== scope.id) {
        throw new ForbiddenException('Evento fora da delegação.');
      }
      const event = await this.prisma.event.findFirst({
        where: { id: scope.id, deletedAt: null },
        select: {
          eventGroupId: true,
          majorEventId: true,
          eventGroup: { select: { majorEventId: true } },
        },
      });
      if (
        !event ||
        groups.some((id) => id !== event.eventGroupId) ||
        majors.some((id) => id !== (event.majorEventId ?? event.eventGroup?.majorEventId))
      ) {
        throw new ForbiddenException('Relacionamento fora da delegação.');
      }
      return;
    }
    if (scope.kind === 'EVENT_GROUP') {
      const group = await this.prisma.eventGroup.findFirst({
        where: { id: scope.id, deletedAt: null },
        select: { majorEventId: true },
      });
      if (
        !group ||
        groups.some((id) => id !== scope.id) ||
        (!events.length && !groups.length) ||
        majors.some((id) => id !== group.majorEventId)
      ) {
        throw new ForbiddenException('Grupo fora da delegação.');
      }
      const count = await this.prisma.event.count({
        where: { id: { in: events }, eventGroupId: scope.id, deletedAt: null },
      });
      if (count !== events.length) {
        throw new ForbiddenException('Evento fora do grupo delegado.');
      }
      return;
    }
    if (majors.some((id) => id !== scope.id)) {
      throw new ForbiddenException('Grande evento fora da delegação.');
    }
    const [eventCount, groupCount, major] = await Promise.all([
      this.prisma.event.count({
        where: {
          id: { in: events },
          deletedAt: null,
          OR: [{ majorEventId: scope.id }, { eventGroup: { is: { majorEventId: scope.id, deletedAt: null } } }],
        },
      }),
      this.prisma.eventGroup.count({
        where: { id: { in: groups }, majorEventId: scope.id, deletedAt: null },
      }),
      this.prisma.majorEvent.findFirst({
        where: { id: scope.id, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!major || eventCount !== events.length || groupCount !== groups.length) {
      throw new ForbiddenException('Recurso fora do grande evento delegado.');
    }
  }
}
