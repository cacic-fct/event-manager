import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import {
  parseEventMaterials,
  MAX_EVENT_INFORMATION_LENGTH,
  type EventMaterial,
} from '@cacic-fct/shared-event-preparation';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { IncludePastParticipation } from '../audiences/past-participation.decorator';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { type GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import { EventMaterialInput, EventMaterials, EventPreparation } from './event-preparation.models';
import { ContentReviewInvalidationService } from '../content-review/content-review-invalidation.service';
import { ContentReviewNotifications } from '../content-review/content-review-notifications.service';
import {
  applyMaterialChanges,
  diffMaterials,
  materialKey,
  lockReviewPerson,
  readChanges,
  writeReview,
} from '../content-review/content-review-changes';
import {
  lockPreparationEvent,
  materialDraftRevision,
  nextContentRevision,
  parseMaterialSubmission,
  publishMaterials,
} from '../content-review/material-review';
import { canReviewContent } from '../content-review/review-permissions';
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
    private readonly reviewNotifications: ContentReviewNotifications,
    private readonly reviewInvalidations: ContentReviewInvalidationService,
  ) {}

  @Query(() => EventPreparation)
  @RequirePermissions(Permission.Event.Read)
  async eventPreparation(@Args('eventId', { type: () => String }) eventId: string, @Context() context: GraphqlContext) {
    await this.requireAdmin(eventId, Permission.Event.Read, context);
    const event = await this.requireEvent(eventId);
    return {
      lecturerInformation: event.lecturerInformation,
      collectorInformation: event.collectorInformation,
      updatedAt: event.preparationUpdatedAt,
    };
  }

  @Query(() => EventMaterials)
  async editableEventMaterials(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ) {
    const lecturer = await this.requireMaterialAccess(eventId, context, false);
    const user = this.currentUser.getAuthenticatedUser(context);
    let editingFrozen = false;
    try {
      await this.frozen.assertEventUpdateMutable(eventId, {}, user);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
      editingFrozen = true;
    }
    const { event, review, editingBlocked } = lecturer
      ? await this.prisma.$transaction(async (tx) => ({
          event: await lockPreparationEvent(tx, eventId),
          review: await tx.contentReview.findUnique({ where: { eventId } }),
          editingBlocked: await this.materialEditingBlocked(tx, lecturer.id),
        }))
      : { event: await this.requireEvent(eventId), review: null, editingBlocked: false };
    const changes = readChanges(review).filter((change) => change.kind === 'material');
    return {
      links: applyMaterialChanges(parseEventMaterials(event.materials), changes).map(withMaterialIdentity),
      updatedAt: materialDraftRevision(event.materialsUpdatedAt, review?.updatedAt),
      editingFrozen,
      editingBlocked,
      pendingReview: !!review,
      reviewRequired: !!lecturer,
    };
  }

  @Query(() => EventMaterials, { nullable: true })
  @IncludePastParticipation()
  async currentUserEventMaterials(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ) {
    const person = await this.currentUser.requireCurrentPerson(context);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, AND: [PUBLIC_EVENT_WHERE, eventSubscriberWhere(person.id)] },
      select: { materials: true, materialsUpdatedAt: true, endDate: true },
    });
    if (!event) return null;
    const links = parseEventMaterials(event.materials);
    const hasEnded = event.endDate.getTime() <= Date.now();
    return {
      links: links
        .filter((link) => !link.releaseAfterEvent || hasEnded)
        .map(({ title, url, releaseAfterEvent }) => ({
          title,
          url,
          ...(releaseAfterEvent ? { releaseAfterEvent } : {}),
        })),
      updatedAt: event.materialsUpdatedAt,
      nextReleaseAt: !hasEnded && links.some((link) => link.releaseAfterEvent) ? event.endDate : null,
    };
  }

  @Query(() => String, { nullable: true })
  async eventCollectorInformation(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ) {
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
    @Args('eventId', { type: () => String }) eventId: string,
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
      const previous = await lockPreparationEvent(tx, eventId);
      assertRevision(previous.preparationUpdatedAt, expectedUpdatedAt);
      if (
        previous.lecturerInformation === data.lecturerInformation &&
        previous.collectorInformation === data.collectorInformation
      ) {
        return { ...data, updatedAt: previous.preparationUpdatedAt };
      }
      const updatedAt = nextContentRevision(previous.preparationUpdatedAt);
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
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('links', { type: () => [EventMaterialInput] }) links: EventMaterialInput[],
    @Args('expectedUpdatedAt', { type: () => Date, nullable: true }) expectedUpdatedAt: Date | null,
    @Context() context: GraphqlContext,
  ) {
    const lecturer = await this.requireMaterialAccess(eventId, context, true);
    const user = this.currentUser.getAuthenticatedUser(context);
    await this.frozen.assertEventUpdateMutable(eventId, {}, user);
    let normalized: ReturnType<typeof parseEventMaterials>;
    try {
      normalized = parseMaterialSubmission(links);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Materiais inválidos.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const previous = await lockPreparationEvent(tx, eventId);
      if (lecturer) {
        await lockReviewPerson(tx, lecturer.id);
        if (await this.materialEditingBlocked(tx, lecturer.id)) {
          throw new ForbiddenException('A edição de materiais foi bloqueada pela organização.');
        }
      }
      const review = await tx.contentReview.findUnique({ where: { eventId } });
      const published = parseEventMaterials(previous.materials);
      const pending = readChanges(review).filter((change) => change.kind === 'material');
      const revision = lecturer
        ? materialDraftRevision(previous.materialsUpdatedAt, review?.updatedAt)
        : previous.materialsUpdatedAt;
      assertRevision(revision, expectedUpdatedAt);
      const original = lecturer ? applyMaterialChanges(published, pending) : published;
      const submitted = diffMaterials(original, normalized, lecturer?.name ?? '');
      if (!submitted.length) {
        return {
          links: normalized,
          updatedAt: revision,
          pendingReview: !!lecturer && !!review,
          notification: null,
          reviewChanged: false,
        };
      }

      const updatedAt = nextContentRevision(previous.materialsUpdatedAt, review?.updatedAt);
      const touched = new Set(submitted.map(({ key }) => key));
      const untouched = pending.filter(({ key }) => !touched.has(key));
      if (lecturer) {
        const changed = diffMaterials(published, normalized, lecturer.name, lecturer.id).filter(({ key }) =>
          touched.has(key),
        );
        const savedReview = await writeReview(tx, { eventId }, review, [...untouched, ...changed], updatedAt);
        return {
          links: normalized,
          updatedAt: savedReview?.updatedAt ?? previous.materialsUpdatedAt,
          pendingReview: !!savedReview,
          notification: changed.length ? savedReview : null,
          reviewChanged: true,
        };
      }

      await publishMaterials({
        tx,
        audit: this.audit,
        user,
        eventId,
        name: previous.name,
        before: previous.materials,
        links: normalized,
        updatedAt,
      });
      const reviewChanged = untouched.length !== pending.length;
      if (reviewChanged) await writeReview(tx, { eventId }, review, untouched, updatedAt);
      return { links: normalized, updatedAt, pendingReview: false, notification: null, reviewChanged };
    });
    const { notification, reviewChanged, ...materials } = result;
    if (reviewChanged) await this.reviewInvalidations.publish(eventId);
    if (notification) await this.reviewNotifications.notify(notification);
    return { ...materials, links: materials.links.map(withMaterialIdentity), reviewRequired: !!lecturer };
  }

  private async materialEditingBlocked(tx: Prisma.TransactionClient, personId: string): Promise<boolean> {
    const person = await tx.people.findUnique({
      where: { id: personId, deletedAt: null },
      select: { materialEditingBlocked: true },
    });
    return !person || person.materialEditingBlocked;
  }

  private async requireMaterialAccess(eventId: string, context: GraphqlContext, writing: boolean) {
    const user = this.currentUser.getAuthenticatedUser(context);
    if (await canReviewContent(this.authorization, user, Permission.Event.Update, { eventId })) return null;
    if (!writing && (await canReviewContent(this.authorization, user, Permission.Event.Read, { eventId }))) {
      // A lecturer with read-only admin access still edits the lecturer draft.
      if (!user.sub) return null;
      const lecturer = await this.prisma.eventLecturer.findFirst({
        where: { eventId, person: { userId: user.sub, deletedAt: null } },
        select: { person: { select: { id: true, name: true } } },
      });
      return lecturer?.person ?? null;
    }
    const person = await this.currentUser.requireCurrentPerson(context);
    const lecturer = await this.prisma.eventLecturer.findUnique({
      where: { eventId_personId: { eventId, personId: person.id } },
    });
    if (!lecturer)
      throw new ForbiddenException('Somente palestrantes deste evento e organizadores podem editar os materiais.');
    return person;
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

function withMaterialIdentity(link: EventMaterial): EventMaterial {
  return { ...link, id: materialKey(link) };
}
