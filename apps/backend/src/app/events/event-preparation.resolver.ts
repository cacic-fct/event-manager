import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { parseEventMaterials, MAX_EVENT_INFORMATION_LENGTH } from '@cacic-fct/shared-event-preparation';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { type GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import { EventMaterialInput, EventMaterials, EventPreparation } from './event-preparation.models';
import { eventSubscriberWhere } from './event-subscriber-information';

const PREPARATION_SELECT = {
  name: true,
  lecturerInformation: true,
  collectorInformation: true,
  preparationUpdatedAt: true,
  materials: true,
  materialsUpdatedAt: true,
} satisfies Prisma.EventSelect;

@Resolver()
export class EventPreparationResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly audit: AuditLogService,
  ) {}

  @Query(() => EventPreparation)
  @RequirePermissions(Permission.Event.Read)
  async eventPreparation(@Args('eventId') eventId: string, @Context() context: GraphqlContext) {
    await this.requireAdmin(eventId, Permission.Event.Read, context);
    const event = await this.requireEvent(eventId);
    return {
      lecturerInformation: event.lecturerInformation,
      collectorInformation: event.collectorInformation,
      updatedAt: event.preparationUpdatedAt,
    };
  }

  @Query(() => EventMaterials)
  async editableEventMaterials(@Args('eventId') eventId: string, @Context() context: GraphqlContext) {
    await this.requireMaterialAccess(eventId, context, false);
    const event = await this.requireEvent(eventId);
    return { links: parseEventMaterials(event.materials), updatedAt: event.materialsUpdatedAt };
  }

  @Query(() => EventMaterials, { nullable: true })
  async currentUserEventMaterials(@Args('eventId') eventId: string, @Context() context: GraphqlContext) {
    const person = await this.currentUser.requireCurrentPerson(context);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, AND: [PUBLIC_EVENT_WHERE, eventSubscriberWhere(person.id)] },
      select: { materials: true, materialsUpdatedAt: true, endDate: true },
    });
    if (!event) return null;
    const links = parseEventMaterials(event.materials);
    const hasEnded = event.endDate.getTime() <= Date.now();
    return {
      links: links.filter((link) => !link.releaseAfterEvent || hasEnded),
      updatedAt: event.materialsUpdatedAt,
      nextReleaseAt: !hasEnded && links.some((link) => link.releaseAfterEvent) ? event.endDate : null,
    };
  }

  @Query(() => String, { nullable: true })
  async eventCollectorInformation(@Args('eventId') eventId: string, @Context() context: GraphqlContext) {
    const user = this.currentUser.getAuthenticatedUser(context);
    try {
      await this.authorization.assertPermissions(user, [Permission.EventAttendance.Read], { eventId });
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      const person = await this.currentUser.requireCurrentPerson(context);
      await this.authorization.assertAttendanceCollectorForEvent(eventId, person.id, {
        user,
        enforceCollectionWindow: false,
      });
    }
    return (await this.requireEvent(eventId)).collectorInformation;
  }

  @Mutation(() => EventPreparation)
  @RequirePermissions(Permission.Event.Update)
  async updateEventPreparation(
    @Args('eventId') eventId: string,
    @Args('lecturerInformation', { type: () => String, nullable: true }) lecturerInformation: string | null,
    @Args('collectorInformation', { type: () => String, nullable: true }) collectorInformation: string | null,
    @Args('expectedUpdatedAt', { type: () => Date, nullable: true }) expectedUpdatedAt: Date | null,
    @Context() context: GraphqlContext,
  ) {
    await this.requireAdmin(eventId, Permission.Event.Update, context);
    const user = this.currentUser.getAuthenticatedUser(context);
    await this.frozen.assertEventUpdateMutable(eventId, {}, user);
    const data = {
      lecturerInformation: normalizeInformation(lecturerInformation),
      collectorInformation: normalizeInformation(collectorInformation),
    };
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockEvent(tx, eventId);
      assertRevision(previous.preparationUpdatedAt, expectedUpdatedAt);
      if (
        previous.lecturerInformation === data.lecturerInformation &&
        previous.collectorInformation === data.collectorInformation
      ) {
        return { ...data, updatedAt: previous.preparationUpdatedAt };
      }
      const updatedAt = nextRevision(previous.preparationUpdatedAt);
      await tx.event.update({
        where: { id: eventId },
        data: { ...data, preparationUpdatedAt: updatedAt, updatedById: user.sub },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: eventId,
          entityLabel: previous.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: {
            lecturerInformation: previous.lecturerInformation,
            collectorInformation: previous.collectorInformation,
          },
          after: data,
          scope: { permission: Permission.Event.Update, eventId },
          summary: 'Orientações para palestrantes e coletores atualizadas.',
          squashWindowMs: 0,
        },
        tx,
      );
      return { ...data, updatedAt };
    });
  }

  @Mutation(() => EventMaterials)
  async updateEventMaterials(
    @Args('eventId') eventId: string,
    @Args('links', { type: () => [EventMaterialInput] }) links: EventMaterialInput[],
    @Args('expectedUpdatedAt', { type: () => Date, nullable: true }) expectedUpdatedAt: Date | null,
    @Context() context: GraphqlContext,
  ) {
    await this.requireMaterialAccess(eventId, context, true);
    const user = this.currentUser.getAuthenticatedUser(context);
    await this.frozen.assertEventUpdateMutable(eventId, {}, user);
    let normalized: ReturnType<typeof parseEventMaterials>;
    try {
      normalized = parseEventMaterials(links);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Materiais inválidos.');
    }
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.lockEvent(tx, eventId);
      assertRevision(previous.materialsUpdatedAt, expectedUpdatedAt);
      if (JSON.stringify(parseEventMaterials(previous.materials)) === JSON.stringify(normalized)) {
        return { links: normalized, updatedAt: previous.materialsUpdatedAt };
      }
      const updatedAt = nextRevision(previous.materialsUpdatedAt);
      await tx.event.update({
        where: { id: eventId },
        data: {
          materials: normalized.map((link) => ({ ...link })),
          materialsUpdatedAt: updatedAt,
          updatedById: user.sub,
        },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: eventId,
          entityLabel: previous.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: { materials: previous.materials },
          after: { materials: normalized },
          scope: { eventId },
          summary: 'Materiais para inscritos atualizados.',
          squashWindowMs: 0,
        },
        tx,
      );
      // Materials never enqueue notifications, regardless of who edited them.
      return { links: normalized, updatedAt };
    });
  }

  private async requireMaterialAccess(eventId: string, context: GraphqlContext, writing: boolean) {
    const user = this.currentUser.getAuthenticatedUser(context);
    const permission = writing ? Permission.Event.Update : Permission.Event.Read;
    try {
      await this.authorization.assertPermissions(user, [permission], { eventId });
      return;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
    const person = await this.currentUser.requireCurrentPerson(context);
    const lecturer = await this.prisma.eventLecturer.findUnique({
      where: { eventId_personId: { eventId, personId: person.id } },
    });
    if (!lecturer)
      throw new ForbiddenException('Somente palestrantes deste evento e organizadores podem editar os materiais.');
  }

  private async requireAdmin(eventId: string, permission: string, context: GraphqlContext) {
    await this.authorization.assertPermissions(this.currentUser.getAuthenticatedUser(context), [permission], {
      eventId,
    });
  }

  private async requireEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: PREPARATION_SELECT,
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  private async lockEvent(tx: Prisma.TransactionClient, eventId: string) {
    await tx.$executeRaw`SELECT "id" FROM "events" WHERE "id" = ${eventId} AND "deletedAt" IS NULL FOR UPDATE`;
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: PREPARATION_SELECT,
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    return event;
  }
}

function normalizeInformation(content: string | null): string | null {
  if (content != null && content.length > MAX_EVENT_INFORMATION_LENGTH)
    throw new BadRequestException('Use até 10.000 caracteres por orientação.');
  return content?.trim() || null;
}
function assertRevision(actual: Date | null, expected: Date | null): void {
  if ((actual?.getTime() ?? null) !== (expected?.getTime() ?? null)) {
    throw new ConflictException('Estas informações foram alteradas. Recarregue antes de salvar novamente.');
  }
}
function nextRevision(previous: Date | null): Date {
  return new Date(Math.max(Date.now(), (previous?.getTime() ?? 0) + 1));
}
