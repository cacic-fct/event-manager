import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogEntry, AuditLogEntityHistoryInput, AuditLogRevertInput } from './audit-log.models';
import { AuditLogService } from './audit-log.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => AuditLogEntry)
export class AuditLogResolver {
  constructor(private readonly auditLog: AuditLogService) {}

  @RequireRoles(EventManagerKeycloakRole.SuperAdmin)
  @Query(() => [AuditLogEntry], { name: 'auditLogEntries' })
  auditLogEntries(
    @Args('input', { type: () => AuditLogEntityHistoryInput }) input: AuditLogEntityHistoryInput,
    @Context() context: GraphqlContext,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.auditLog.listEntityHistory(input.entityType, input.entityId, this.getUser(context), take);
  }

  @RequireRoles(EventManagerKeycloakRole.SuperAdmin)
  @Mutation(() => AuditLogEntry, { name: 'revertAuditLogEntry' })
  revertAuditLogEntry(
    @Args('input', { type: () => AuditLogRevertInput }) input: AuditLogRevertInput,
    @Context() context: GraphqlContext,
  ) {
    return this.auditLog.revertEntry(input, this.getUser(context));
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
