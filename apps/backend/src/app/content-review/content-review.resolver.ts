import { Permission } from '@cacic-fct/shared-permissions';
import { parseEventMaterials } from '@cacic-fct/shared-event-preparation';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, type ContentReview, type Prisma } from '@prisma/client';
import { audienceContext, eventAudienceWhere } from '../audiences/audience-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import type { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyMaterialChanges,
  assertProfileChangeCurrent,
  lockReviewPerson,
  profileSnapshot,
  readChanges,
  restoreProfileFields,
  writeReview,
  type ContentChange,
} from './content-review-changes';
import { ContentReviewInvalidationService } from './content-review-invalidation.service';
import { ContentReviewDecision, ContentReviewPage } from './content-review.models';
import { presentReview } from './content-review-presenter';
import {
  lockPreparationEvent,
  nextContentRevision,
  publishMaterials,
  validateApprovedMaterials,
} from './material-review';
import { canReviewContent } from './review-permissions';

const PAGE_SIZE = 20;
const PROFILE_PERMISSIONS = [Permission.LecturerProfile.Review, Permission.Person.Update] as const;
const MATERIAL_PERMISSIONS = [Permission.EventMaterials.Review, Permission.Event.Update] as const;

type ReviewAction = {
  review: ContentReview;
  selected: ContentChange[];
  decision: ContentReviewDecision;
  user: AuthenticatedUser;
  permission: Permission;
};

@Resolver()
export class ContentReviewResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: CurrentUserContextService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly audit: AuditLogService,
    private readonly invalidations: ContentReviewInvalidationService,
  ) {}

  @Query(() => ContentReviewPage)
  async contentReviews(
    @Args('page', { type: () => Int, defaultValue: 0 }) page: number,
    @Args('id', { type: () => String, nullable: true }) id: string | null,
    @Context() context: GraphqlContext,
  ): Promise<ContentReviewPage> {
    if (page < 0) throw new BadRequestException('Página inválida.');
    const user = this.context.getAuthenticatedUser(context);
    const { profilePermission, materialScope } = await this.queueAccess(user);

    const groups = await this.prisma.contentReview.findMany({
      where: {
        id: id ?? undefined,
        OR: [
          ...(profilePermission ? [{ profile: { is: { person: { deletedAt: null } } } }] : []),
          ...(materialScope ? [{ event: { is: materialScope } }] : []),
        ],
      },
      include: {
        profile: { select: { selfEditingBlocked: true, person: { select: { name: true } } } },
        event: { select: { name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      skip: page * PAGE_SIZE,
    });
    const visible = groups.slice(0, PAGE_SIZE);
    const canManagePeople =
      profilePermission === Permission.Person.Update ||
      (await canReviewContent(this.authorization, user, Permission.Person.Update));
    const authorIds = canManagePeople
      ? [
          ...new Set(
            visible
              .flatMap(readChanges)
              .flatMap((change) =>
                change.kind === 'material' && change.authorPersonId ? [change.authorPersonId] : [],
              ),
          ),
        ]
      : [];
    const authors = authorIds.length
      ? await this.prisma.people.findMany({
          where: { id: { in: authorIds }, deletedAt: null },
          select: { id: true, materialEditingBlocked: true },
        })
      : [];
    const materialBlocks = new Map(authors.map((author) => [author.id, author.materialEditingBlocked]));
    return {
      groups: visible.map((review) => presentReview(review, canManagePeople, materialBlocks)),
      hasNextPage: groups.length > PAGE_SIZE,
    };
  }

  @Mutation(() => Boolean)
  async blockContentReviewEditing(
    @Args('id', { type: () => String }) id: string,
    @Args('revision', { type: () => Int }) revision: number,
    @Args('key', { type: () => String, nullable: true }) key: string | null,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const user = this.context.getAuthenticatedUser(context);
    await this.authorization.assertPermissions(user, [Permission.Person.Update]);
    const target = await this.prisma.contentReview.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Esta revisão não está mais pendente.');
    if (!(await this.reviewPermission(user, target.eventId))) {
      throw new ForbiddenException('Você não tem permissão para revisar este conteúdo.');
    }

    await this.prisma.$transaction(async (tx) => {
      if (target.eventId) await lockPreparationEvent(tx, target.eventId);
      if (target.personId) await lockReviewPerson(tx, target.personId);
      const review = await tx.contentReview.findUnique({ where: { id } });
      if (!review || review.revision !== revision) {
        throw new ConflictException('A fila mudou. Atualize a página antes de bloquear a edição.');
      }

      if (review.personId) {
        const profile = await tx.lecturerProfile.findFirst({
          where: { personId: review.personId, person: { deletedAt: null } },
        });
        if (!profile) throw new NotFoundException('Perfil de palestrante não encontrado.');
        if (profile.selfEditingBlocked) return;
        await tx.lecturerProfile.update({
          where: { id: profile.id },
          data: { selfEditingBlocked: true, updatedById: user.sub },
        });
        await this.audit.record(
          {
            entityType: AuditLogEntityType.LECTURER_PROFILE,
            entityId: profile.id,
            entityLabel: profile.displayName,
            actor: user,
            operation: AuditLogOperation.UPDATE,
            before: { selfEditingBlocked: false },
            after: { selfEditingBlocked: true },
            scope: { permission: Permission.Person.Update },
            summary: 'Edição do próprio perfil de palestrante bloqueada.',
          },
          tx,
        );
        return;
      }

      const change = readChanges(review).find((item) => item.key === key);
      if (change?.kind !== 'material' || !change.authorPersonId) {
        throw new BadRequestException('Não foi possível identificar o autor deste envio.');
      }
      await lockReviewPerson(tx, change.authorPersonId);
      const person = await tx.people.findUnique({ where: { id: change.authorPersonId, deletedAt: null } });
      if (!person) throw new NotFoundException('Pessoa não encontrada.');
      if (person.materialEditingBlocked) return;
      await tx.people.update({
        where: { id: person.id },
        data: { materialEditingBlocked: true, updatedById: user.sub },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.PERSON,
          entityId: person.id,
          entityLabel: person.name,
          actor: user,
          operation: AuditLogOperation.UPDATE,
          before: { materialEditingBlocked: false },
          after: { materialEditingBlocked: true },
          scope: { permission: Permission.Person.Update },
          summary: 'Edição de materiais para inscritos bloqueada.',
        },
        tx,
      );
    });
    await this.invalidations.publish(null);
    return true;
  }

  @Mutation(() => Boolean)
  async decideContentReview(
    @Args('id', { type: () => String }) id: string,
    @Args('revision', { type: () => Int }) revision: number,
    @Args('keys', { type: () => [String] }) keys: string[],
    @Args('decision', { type: () => ContentReviewDecision }) decision: ContentReviewDecision,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    if (!keys.length || keys.length > 40 || new Set(keys).size !== keys.length) {
      throw new BadRequestException('Selecione as alterações que deseja revisar.');
    }
    const user = this.context.getAuthenticatedUser(context);
    const target = await this.prisma.contentReview.findUnique({
      where: { id },
      select: { personId: true, eventId: true },
    });
    if (!target) throw new NotFoundException('Esta revisão não está mais pendente.');
    const permission = await this.reviewPermission(user, target.eventId);
    if (!permission) throw new ForbiddenException('Você não tem permissão para revisar este conteúdo.');

    if (target.eventId && decision === ContentReviewDecision.APPROVE) {
      await this.frozen.assertEventUpdateMutable(target.eventId, {}, user);
    }
    await this.prisma.$transaction(async (tx) => {
      const { personId, eventId } = target;
      // Submission and decisions serialize on the same target, including the first profile save.
      const event = eventId ? await lockPreparationEvent(tx, eventId) : null;
      if (personId) await lockReviewPerson(tx, personId);

      const review = await tx.contentReview.findUnique({ where: { id } });
      if (!review || review.revision !== revision) {
        throw new ConflictException('A fila mudou. Atualize a página antes de revisar.');
      }
      const changes = readChanges(review);
      const allKeys = new Set(keys);
      const selected = changes.filter(({ key }) => allKeys.has(key));
      if (selected.length !== keys.length) throw new BadRequestException('Alterações inválidas.');

      const action = { review, selected, decision, user, permission };
      const remaining = changes.filter(({ key }) => !allKeys.has(key));
      if (personId) {
        await writeReview(tx, { personId }, review, remaining);
        await this.decideProfile(tx, personId, action);
      } else if (eventId && event) {
        const updatedAt = nextContentRevision(event.materialsUpdatedAt, review.updatedAt);
        await this.decideMaterials(tx, eventId, event, action, updatedAt);
        await writeReview(tx, { eventId }, review, remaining, updatedAt);
      }
    });
    await this.invalidations.publish(target.eventId);
    return true;
  }

  private async decideProfile(tx: Prisma.TransactionClient, personId: string, action: ReviewAction): Promise<void> {
    const { user, selected, permission, decision, review } = action;
    const profile = await tx.lecturerProfile.findFirst({ where: { personId, person: { deletedAt: null } } });
    if (!profile) throw new NotFoundException('Perfil de palestrante não encontrado.');
    const snapshot = profileSnapshot(profile);
    const changes = selected.filter((change) => change.kind !== 'material');
    for (const change of changes) assertProfileChangeCurrent(snapshot, change);
    const approved = decision === ContentReviewDecision.APPROVE;
    if (!approved) {
      if (changes.some((change) => change.kind === 'profileCreation')) {
        await tx.lecturerProfile.delete({ where: { id: profile.id } });
      } else {
        const fields = changes.filter((change) => change.kind === 'profileField');
        await tx.lecturerProfile.update({
          where: { id: profile.id },
          data: { ...restoreProfileFields(snapshot, fields), updatedById: user.sub },
        });
      }
    }
    await this.audit.record(
      {
        entityType: AuditLogEntityType.LECTURER_PROFILE,
        entityId: profile.id,
        entityLabel: profile.displayName,
        actor: user,
        operation: approved ? AuditLogOperation.APPROVE : AuditLogOperation.REJECT,
        before: profileAuditFields(changes, approved ? 'before' : 'after'),
        after: profileAuditFields(changes, approved ? 'after' : 'before'),
        scope: { permission },
        summary: approved
          ? 'Alterações no perfil de palestrante aprovadas.'
          : 'Alterações no perfil de palestrante revertidas.',
        metadata: { contentReviewId: review.id, keys: changes.map(({ key }) => key) },
        squashWindowMs: 0,
        force: true,
      },
      tx,
    );
  }

  private async decideMaterials(
    tx: Prisma.TransactionClient,
    eventId: string,
    event: Awaited<ReturnType<typeof lockPreparationEvent>>,
    action: ReviewAction,
    updatedAt: Date,
  ): Promise<void> {
    const { user, selected, permission, decision, review } = action;
    const changes = selected.filter((change) => change.kind === 'material');
    const metadata = { contentReviewId: review.id, keys: changes.map(({ key }) => key) };
    if (decision === ContentReviewDecision.APPROVE) {
      const links = validateApprovedMaterials(applyMaterialChanges(parseEventMaterials(event.materials), changes));
      await publishMaterials({
        tx,
        audit: this.audit,
        user,
        eventId,
        name: event.name,
        before: event.materials,
        links,
        updatedAt,
        review: { permission, metadata },
      });
      return;
    }
    await this.audit.record(
      {
        entityType: AuditLogEntityType.EVENT,
        entityId: eventId,
        entityLabel: event.name,
        actor: user,
        operation: AuditLogOperation.REJECT,
        before: { materials: changes.flatMap(({ after }) => (after ? [after] : [])) },
        after: { materials: changes.flatMap(({ before }) => (before ? [before] : [])) },
        scope: { eventId, permission },
        summary: 'Alterações em materiais para inscritos rejeitadas.',
        metadata,
        squashWindowMs: 0,
        force: true,
      },
      tx,
    );
  }

  async queueAccess(user: AuthenticatedUser) {
    const profilePermission = await this.reviewPermission(user, null);
    const materialScope = await this.materialScope(user);

    if (!profilePermission && !materialScope) throw new ForbiddenException('A fila de revisão exige permissão.');

    return { profilePermission, materialScope };
  }

  private async reviewPermission(user: AuthenticatedUser, eventId: string | null): Promise<Permission | null> {
    for (const permission of eventId ? MATERIAL_PERMISSIONS : PROFILE_PERMISSIONS) {
      if (await canReviewContent(this.authorization, user, permission, eventId ? { eventId } : undefined))
        return permission;
    }
    return null;
  }

  private async materialScope(user: AuthenticatedUser): Promise<Prisma.EventWhereInput | null> {
    const principal = audienceContext.getStore();
    const audience = principal ? eventAudienceWhere({ ...principal, pastParticipationBefore: undefined }) : {};
    const scopes: Prisma.EventWhereInput[] = [];
    for (const permission of MATERIAL_PERMISSIONS) {
      const targets = await this.authorization.accessibleEventTargets(user, permission);
      if (!targets) return { deletedAt: null, AND: [audience] };
      if (targets.eventIds.size) scopes.push({ id: { in: [...targets.eventIds] } });
      if (targets.eventGroupIds.size) scopes.push({ eventGroupId: { in: [...targets.eventGroupIds] } });
      if (targets.majorEventIds.size) scopes.push({ majorEventId: { in: [...targets.majorEventIds] } });
    }
    return scopes.length ? { deletedAt: null, AND: [audience, { OR: scopes }] } : null;
  }
}

function profileAuditFields(changes: ContentChange[], side: 'before' | 'after'): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const change of changes) {
    if (change.kind === 'profileCreation') {
      const value = change[side];
      if (value) {
        const { photo, ...profile } = value;
        Object.assign(fields, profile, photo);
      }
    }
    if (change.kind === 'profileField') {
      if (change.key === 'photo') Object.assign(fields, change[side]);
      else fields[change.key] = change[side];
    }
  }
  return fields;
}
