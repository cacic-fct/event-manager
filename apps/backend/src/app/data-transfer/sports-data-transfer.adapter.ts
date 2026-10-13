import { TransferValidationException } from './transfer-validation.exception';
import { Permission } from '@cacic-fct/shared-permissions';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  AttendanceEligibility,
  EventAudience,
  Prisma,
  SportsAthleteIdentifierMode,
  SportsFormat,
  SportsLivestreamProvider,
  SportsMatchState,
  SportsPreset,
  SportsScoringMode,
  SportsStageType,
} from '@prisma/client';
import {
  type JsonValue,
  type ResolvedTransferDocument,
  type TransferChange,
  type TransferExportRequest,
  type TransferIssue,
  type TransferResource,
  type TransferResourceKind,
  type TransferTarget,
  TRANSFER_MAX_RESOURCES,
  canonicalTransferJson,
} from '@cacic-fct/shared-data-transfer';
import { assertSportsOverallScoringRules } from '../sports/domain/sports-overall-scoring';
import type { Permission as PermissionType } from '@cacic-fct/shared-permissions';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AuthorizationPolicyService,
  type AuthorizationResourceContext,
} from '../authorization/authorization-policy.service';
import type { FrozenOperation } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsAdminService } from '../sports/sports-admin.service';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { normalizeEventCertificateSettings } from '../events/event-certificate-settings';
import { assertSportsTimerRules, assertSportsScoreRules } from './sports-transfer-rules';
import type {
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferAdapterApplyResult,
  TransferAdapterExportResult,
  TransferAdapterContext,
  TransferAuthorizationScope,
  TransferResourceReference,
  TransferWriteAction,
} from './data-transfer-adapter';

const SPORTS_TRANSFER_KINDS = [
  'sports-tournament',
  'sports-category',
  'sports-venue',
  'sports-stage',
  'sports-match',
] as const satisfies readonly TransferResourceKind[];

const MATCH_EVENT_FIELDS = new Set(['name', 'emoji', 'startDate', 'endDate', 'majorEventId', 'eventGroupId']);
const BACKING_GROUP_FIELDS = new Set([
  'name',
  'emoji',
  'majorEventId',
  'audience',
  'audienceCourseCodes',
  'interestEnabled',
  'requiresImageLicenseAgreement',
  'attendanceEligibility',
  'shouldIssueCertificate',
  'shouldIssueCertificateForNonPayingAttendees',
  'shouldIssueCertificateForNonSubscribedAttendees',
  'shouldIssueCertificateForEachEvent',
  'shouldIssuePartialCertificate',
]);

type PlainRecord = Record<string, unknown>;
type TournamentExportRow = Prisma.SportsTournamentGetPayload<{ include: { majorEvent: true } }>;
type CategoryExportRow = Prisma.SportsCategoryGetPayload<{
  include: { eventGroup: true; tournament: { include: { majorEvent: true } } };
}>;
type VenueExportRow = Prisma.SportsVenueGetPayload<{
  include: { tournament: { include: { majorEvent: true } }; placePreset: true };
}>;
type MatchExportRow = Prisma.SportsMatchGetPayload<{
  include: {
    event: true;
    category: { include: { eventGroup: true; tournament: { include: { majorEvent: true } } } };
    stage: true;
    venue: { include: { tournament: { include: { majorEvent: true } }; placePreset: true } };
  };
}>;

@Injectable()
export class SportsDataTransferAdapter implements DataTransferAdapter {
  readonly kinds = SPORTS_TRANSFER_KINDS;
  readonly dependencyOrder = 30;

  async readAppliedResource(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<TransferResource> {
    const { kind, id } = snapshot.resource;
    switch (kind) {
      case 'sports-tournament':
        return this.tournamentResource(await context.tx.sportsTournament.findUniqueOrThrow({ where: { id } }));
      case 'sports-category':
        return this.categoryResource(
          await context.tx.sportsCategory.findUniqueOrThrow({
            where: { id },
            include: { eventGroup: true },
          }),
        );
      case 'sports-venue':
        return this.venueResource(await context.tx.sportsVenue.findUniqueOrThrow({ where: { id } }));
      case 'sports-stage':
        return this.stageResource(await context.tx.sportsStage.findUniqueOrThrow({ where: { id } }));
      case 'sports-match':
        return this.matchResource(
          await context.tx.sportsMatch.findUniqueOrThrow({
            where: { id },
            include: { event: true },
          }),
        );
      case 'group':
        return this.groupResource(await context.tx.eventGroup.findUniqueOrThrow({ where: { id } }));
      case 'event':
        return this.backingEventResource(await context.tx.event.findUniqueOrThrow({ where: { id } }));
      default:
        throw new TransferValidationException('O recurso não pertence à modalidade esportiva.');
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly admin: SportsAdminService,
    private readonly auditLog: AuditLogService,
    private readonly mutationEvents: SportsMutationEventsService,
  ) {}

  async claims(resource: TransferResource, context: TransferAdapterContext): Promise<boolean> {
    if (resource.kind === 'group') {
      const proposedOwner = this.findDocumentResource(
        context.document,
        'sports-category',
        (candidate) => this.text(this.data(candidate).eventGroupId) === resource.id,
      );
      if (proposedOwner) {
        return true;
      }
      return Boolean(
        await context.tx.sportsCategory.findFirst({
          where: { eventGroupId: resource.id, deletedAt: null },
          select: { id: true },
        }),
      );
    }

    if (resource.kind === 'event') {
      const proposedOwner = this.findDocumentResource(
        context.document,
        'sports-match',
        (candidate) => this.text(this.data(candidate).eventId) === resource.id,
      );
      if (proposedOwner) {
        return true;
      }
      return Boolean(
        await context.tx.sportsMatch.findFirst({
          where: { eventId: resource.id, deletedAt: null },
          select: { id: true },
        }),
      );
    }

    return false;
  }

  async resolve(resource: TransferResource, context: TransferAdapterContext): Promise<ResolvedTransferResource> {
    switch (resource.kind) {
      case 'sports-tournament':
        return this.resolveTournament(resource, context);
      case 'sports-category':
        return this.resolveCategory(resource, context);
      case 'sports-venue':
        return this.resolveVenue(resource, context);
      case 'sports-stage':
        return this.resolveStage(resource, context);
      case 'sports-match':
        return this.resolveMatch(resource, context);
      case 'group':
        return this.resolveBackingGroup(resource, context);
      case 'event':
        return this.resolveBackingEvent(resource, context);
      default:
        throw new TransferValidationException('O recurso não pertence à modalidade esportiva.');
    }
  }

  async assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const scope = await this.authorizationScope(snapshot, context);
    await this.assertPermission(context, Permission.DataTransfer.Import, scope);
    switch (snapshot.resource.kind) {
      case 'sports-tournament':
        await this.assertPermission(context, Permission.SportsTournament.Read, scope);
        await this.assertPermission(context, Permission.MajorEvent.Read, scope);
        return;
      case 'sports-category':
        await this.assertPermission(context, Permission.SportsCategory.Read, scope);
        await this.assertPermission(context, Permission.SportsTournament.Read, scope);
        await this.assertPermission(context, Permission.EventGroup.Read, scope);
        return this.assertCategoryReferencesReadable(snapshot, context, scope);
      case 'sports-venue':
        await this.assertPermission(context, Permission.SportsTournament.Read, scope);
        await this.assertPermission(context, Permission.PlacePreset.Read, {});
        return;
      case 'sports-stage':
        await this.assertPermission(context, Permission.SportsCategory.Read, scope);
        return;
      case 'sports-match':
        await this.assertPermission(context, Permission.SportsMatch.Read, scope);
        await this.assertPermission(context, Permission.SportsCategory.Read, scope);
        await this.assertPermission(context, Permission.Event.Read, scope);
        return this.assertMatchReferencesReadable(snapshot, context, scope);
      case 'group':
        await this.assertPermission(context, Permission.EventGroup.Read, scope);
        await this.assertPermission(context, Permission.SportsCategory.Read, scope);
        return;
      case 'event':
        await this.assertPermission(context, Permission.Event.Read, scope);
        await this.assertPermission(context, Permission.SportsMatch.Read, scope);
        return;
      default:
        throw new TransferValidationException('O recurso não pertence à modalidade esportiva.');
    }
  }

  async assertWrite(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void> {
    const scope = await this.authorizationScope(snapshot, context);
    await this.assertPermission(context, Permission.DataTransfer.Import, scope);
    const permission = (create: PermissionType, update: PermissionType) => (action === 'create' ? create : update);

    switch (snapshot.resource.kind) {
      case 'sports-tournament':
        await this.assertPermission(
          context,
          permission(Permission.SportsTournament.Create, Permission.SportsTournament.Update),
          scope,
        );
        await this.assertPermission(context, Permission.MajorEvent.Read, scope);
        return;
      case 'sports-category':
        await this.assertPermission(
          context,
          permission(Permission.SportsCategory.Create, Permission.SportsCategory.Update),
          scope,
        );
        await this.assertPermission(
          context,
          permission(Permission.EventGroup.Create, Permission.EventGroup.Update),
          scope,
        );
        return this.assertCategoryReferencesReadable(snapshot, context, scope);
      case 'sports-venue':
        await this.assertPermission(context, Permission.SportsTournament.Update, scope);
        await this.assertPermission(context, Permission.PlacePreset.Read, {});
        return;
      case 'sports-stage':
        await this.assertPermission(context, Permission.SportsCategory.Update, scope);
        return;
      case 'sports-match':
        await this.assertPermission(
          context,
          permission(Permission.SportsMatch.Create, Permission.SportsMatch.Update),
          scope,
        );
        await this.assertPermission(context, permission(Permission.Event.Create, Permission.Event.Update), scope);
        return this.assertMatchReferencesReadable(snapshot, context, scope);
      case 'group':
        await this.assertPermission(
          context,
          permission(Permission.EventGroup.Create, Permission.EventGroup.Update),
          scope,
        );
        await this.assertPermission(
          context,
          permission(Permission.SportsCategory.Create, Permission.SportsCategory.Update),
          scope,
        );
        return;
      case 'event':
        await this.assertPermission(context, permission(Permission.Event.Create, Permission.Event.Update), scope);
        await this.assertPermission(
          context,
          permission(Permission.SportsMatch.Create, Permission.SportsMatch.Update),
          scope,
        );
        return;
      default:
        throw new TransferValidationException('O recurso não pertence à modalidade esportiva.');
    }
  }

  async assertMutable(
    snapshot: ResolvedTransferResource,
    operation: FrozenOperation,
    context: TransferAdapterContext,
  ): Promise<void> {
    const scope = await this.existingAncestorScope(snapshot, context);
    if (scope.majorEventId) {
      await context.frozenResources.assertMajorEventMutable(scope.majorEventId, context.actor, operation);
    }
    if (scope.eventGroupId && (this.hasExisting(snapshot) || snapshot.resource.kind === 'sports-stage')) {
      await context.frozenResources.assertEventGroupMutable(scope.eventGroupId, context.actor, operation);
    }
    if (scope.eventId && this.hasExisting(snapshot)) {
      await context.frozenResources.assertEventMutable(scope.eventId, context.actor, operation);
    }
  }

  async validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    if (snapshot.skip) {
      return;
    }
    this.assertAllowedDataKeys(snapshot.resource);
    this.assertRequestedScope(snapshot.scope, context.requestedScope);

    switch (snapshot.resource.kind) {
      case 'sports-tournament':
        return this.validateTournament(snapshot, context);
      case 'sports-category':
        return this.validateCategory(snapshot, context);
      case 'sports-venue':
        return this.validateVenue(snapshot, context);
      case 'sports-stage':
        return this.validateStage(snapshot, context);
      case 'sports-match':
        return this.validateMatch(snapshot, context);
      case 'group':
        return this.validateBackingGroup(snapshot, context);
      case 'event':
        return this.validateBackingEvent(snapshot, context);
    }
  }

  async apply(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    if (snapshot.skip) {
      return {};
    }
    if (snapshot.ownedBy) {
      return {};
    }
    await this.assertSnapshotRevision(snapshot, context);

    switch (snapshot.resource.kind) {
      case 'sports-tournament':
        return this.applyTournament(snapshot, action, context);
      case 'sports-category':
        return this.applyCategory(snapshot, action, context);
      case 'sports-venue':
        return this.applyVenue(snapshot, action, context);
      case 'sports-stage':
        return this.applyStage(snapshot, action, context);
      case 'sports-match':
        return this.applyMatch(snapshot, action, context);
      case 'group':
      case 'event':
        return {};
      default:
        throw new TransferValidationException('O recurso não pertence à modalidade esportiva.');
    }
  }

  async exportTarget(
    target: TransferTarget,
    options: Omit<TransferExportRequest, 'target'>,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterExportResult> {
    if (!options.includeConfiguration) {
      return { resources: [], issues: [] };
    }
    const resources: TransferResource[] = [];
    const issues: TransferIssue[] = [];
    if (target.kind === 'major-event') {
      const tournament = await context.tx.sportsTournament.findFirst({
        where: { majorEventId: target.id, deletedAt: null },
        include: { majorEvent: true },
      });
      if (tournament) {
        await this.appendTournament(tournament, options.includeDescendants, resources, issues, context);
      }
    } else if (target.kind === 'group') {
      const category = await context.tx.sportsCategory.findFirst({
        where: { eventGroupId: target.id, deletedAt: null },
        include: {
          eventGroup: true,
          tournament: { include: { majorEvent: true } },
        },
      });
      if (category) {
        await this.appendCategory(category, options.includeDescendants, resources, issues, context);
      }
    } else {
      const match = await context.tx.sportsMatch.findFirst({
        where: { eventId: target.id, deletedAt: null },
        include: {
          event: true,
          category: { include: { eventGroup: true, tournament: { include: { majorEvent: true } } } },
          stage: true,
          venue: { include: { tournament: { include: { majorEvent: true } }, placePreset: true } },
        },
      });
      if (match) {
        await this.appendMatch(match, resources, issues, context);
      }
    }

    return {
      resources: this.dedupeResources(resources),
      issues: this.dedupeIssues(issues),
    };
  }

  private async appendTournament(
    tournament: TournamentExportRow,
    includeDescendants: boolean,
    resources: TransferResource[],
    issues: TransferIssue[],
    context: TransferAdapterContext,
  ): Promise<void> {
    const transfer = this.tournamentResource(tournament);
    const scope = this.scopeForTournament(tournament);
    if (!(await this.canExport(transfer, scope, context))) {
      issues.push(this.omittedIssue('sports-tournament'));
      return;
    }
    resources.push(transfer);
    if (!includeDescendants) {
      return;
    }

    const [categories, venues] = await Promise.all([
      context.tx.sportsCategory.findMany({
        where: { tournamentId: tournament.id, deletedAt: null },
        include: {
          eventGroup: true,
          tournament: { include: { majorEvent: true } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      context.tx.sportsVenue.findMany({
        where: { tournamentId: tournament.id, deletedAt: null },
        include: { tournament: { include: { majorEvent: true } }, placePreset: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    for (const category of categories) {
      await this.appendCategory(category, true, resources, issues, context);
    }
    for (const venue of venues) {
      await this.appendVenue(venue, resources, issues, context);
    }
  }

  private async appendCategory(
    category: CategoryExportRow,
    includeDescendants: boolean,
    resources: TransferResource[],
    issues: TransferIssue[],
    context: TransferAdapterContext,
  ): Promise<boolean> {
    const tournamentResource = this.tournamentResource(category.tournament);
    const tournamentScope = this.scopeForTournament(category.tournament);
    if (!(await this.canExport(tournamentResource, tournamentScope, context))) {
      issues.push(this.omittedIssue('sports-category'));
      return false;
    }
    const categoryResource = this.categoryResource(category);
    const categoryScope = this.scopeForCategory(category);
    if (!(await this.canExport(categoryResource, categoryScope, context))) {
      issues.push(this.omittedIssue('sports-category'));
      return false;
    }
    if (
      category.registrationFormId &&
      !(await this.canExport(
        this.resource('event-form', category.registrationFormId, {}),
        { ...categoryScope, eventFormId: category.registrationFormId },
        context,
      ))
    ) {
      issues.push(this.omittedIssue('sports-category'));
      return false;
    }
    const groupResource = this.groupResource(category.eventGroup);
    if (!(await this.canExport(groupResource, categoryScope, context))) {
      issues.push(this.omittedIssue('group'));
      return false;
    }

    resources.push(tournamentResource, categoryResource, groupResource);
    if (!includeDescendants) {
      return true;
    }

    const stages = await context.tx.sportsStage.findMany({
      where: { categoryId: category.id, deletedAt: null },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    for (const stage of stages) {
      const stageResource = this.stageResource(stage);
      if (await this.canExport(stageResource, categoryScope, context)) {
        resources.push(stageResource);
      } else {
        issues.push(this.omittedIssue('sports-stage'));
      }
    }
    const matches = await context.tx.sportsMatch.findMany({
      where: { categoryId: category.id, deletedAt: null },
      include: {
        event: true,
        category: { include: { eventGroup: true, tournament: { include: { majorEvent: true } } } },
        stage: true,
        venue: { include: { tournament: { include: { majorEvent: true } }, placePreset: true } },
      },
      orderBy: [{ event: { startDate: 'asc' } }, { id: 'asc' }],
    });
    for (const match of matches) {
      await this.appendMatch(match, resources, issues, context, false);
    }
    return true;
  }

  private async appendVenue(
    venue: VenueExportRow,
    resources: TransferResource[],
    issues: TransferIssue[],
    context: TransferAdapterContext,
  ): Promise<boolean> {
    const scope = this.scopeForTournament(venue.tournament);
    const venueResource = this.venueResource(venue);
    const placeResource = this.placeResource(venue.placePreset);
    if (!(await this.canExport(venueResource, scope, context))) {
      issues.push(this.omittedIssue('sports-venue'));
      return false;
    }
    if (!(await this.canExport(placeResource, scope, context))) {
      issues.push(this.omittedIssue('sports-venue'));
      return false;
    }
    resources.push(venueResource, placeResource);
    if (venue.parentVenueId) {
      const parent = await context.tx.sportsVenue.findFirst({
        where: { id: venue.parentVenueId, tournamentId: venue.tournamentId, deletedAt: null },
        include: { tournament: { include: { majorEvent: true } }, placePreset: true },
      });
      if (!parent || !(await this.appendVenue(parent, resources, issues, context))) {
        issues.push(this.omittedIssue('sports-venue'));
        return false;
      }
    }
    return true;
  }

  private async appendMatch(
    match: MatchExportRow,
    resources: TransferResource[],
    issues: TransferIssue[],
    context: TransferAdapterContext,
    includeCategoryTree = true,
  ): Promise<boolean> {
    if (includeCategoryTree && !(await this.appendCategory(match.category, false, resources, issues, context))) {
      issues.push(this.omittedIssue('sports-match'));
      return false;
    }
    const scope = this.scopeForMatch(match);
    const categoryScope = this.scopeForCategory(match.category);
    if (match.stage) {
      const stageResource = this.stageResource(match.stage);
      if (!(await this.canExport(stageResource, categoryScope, context))) {
        issues.push(this.omittedIssue('sports-match'));
        return false;
      }
      resources.push(stageResource);
    }
    if (match.venue && !(await this.appendVenue(match.venue, resources, issues, context))) {
      issues.push(this.omittedIssue('sports-match'));
      return false;
    }
    const matchResource = this.matchResource(match);
    if (!(await this.canExport(matchResource, scope, context))) {
      issues.push(this.omittedIssue('sports-match'));
      return false;
    }
    const eventResource = this.backingEventResource(match.event);
    if (!(await this.canExport(eventResource, scope, context))) {
      issues.push(this.omittedIssue('event'));
      return false;
    }
    resources.push(matchResource, eventResource);
    return true;
  }

  private async canExport(
    resource: TransferResource,
    scope: TransferAuthorizationScope,
    context: TransferAdapterContext,
  ): Promise<boolean> {
    const permissions = this.readPermissionsFor(resource.kind);
    try {
      await this.assertPermission(context, Permission.DataTransfer.Export, scope);
      for (const permission of permissions) {
        await this.assertPermission(context, permission, permission === Permission.PlacePreset.Read ? {} : scope);
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        return false;
      }
      throw error;
    }
  }

  private readPermissionsFor(kind: TransferResourceKind): PermissionType[] {
    switch (kind) {
      case 'sports-tournament':
        return [Permission.SportsTournament.Read, Permission.MajorEvent.Read];
      case 'sports-category':
        return [Permission.SportsCategory.Read, Permission.SportsTournament.Read, Permission.EventGroup.Read];
      case 'sports-venue':
        return [Permission.SportsTournament.Read, Permission.PlacePreset.Read];
      case 'sports-stage':
        return [Permission.SportsCategory.Read];
      case 'sports-match':
        return [Permission.SportsMatch.Read, Permission.SportsCategory.Read, Permission.Event.Read];
      case 'group':
        return [Permission.EventGroup.Read, Permission.SportsCategory.Read];
      case 'event':
        return [Permission.Event.Read, Permission.SportsMatch.Read];
      case 'place-preset':
        return [Permission.PlacePreset.Read];
      default:
        return [];
    }
  }

  private async resolveExportTournamentIds(target: TransferTarget, context: TransferAdapterContext): Promise<string[]> {
    if (target.kind === 'major-event') {
      const tournament = await context.tx.sportsTournament.findFirst({
        where: { majorEventId: target.id, deletedAt: null },
        select: { id: true },
      });
      return tournament ? [tournament.id] : [];
    }
    if (target.kind === 'group') {
      const category = await context.tx.sportsCategory.findFirst({
        where: { eventGroupId: target.id, deletedAt: null },
        select: { tournamentId: true },
      });
      return category ? [category.tournamentId] : [];
    }
    const match = await context.tx.sportsMatch.findFirst({
      where: { eventId: target.id, deletedAt: null },
      include: { category: { select: { tournamentId: true } } },
    });
    return match ? [match.category.tournamentId] : [];
  }

  private async lookupTournament(
    tournamentId: string,
    context: TransferAdapterContext,
  ): Promise<{ id: string; majorEventId: string; majorEventName?: string; shouldIssueCertificate?: boolean } | null> {
    const source = this.findDocumentResource(context.document, 'sports-tournament', (item) => item.id === tournamentId);
    if (source) {
      const data = this.data(source);
      const needsCurrent = data.majorEventId === undefined || data.shouldIssueCertificate === undefined;
      const current = needsCurrent
        ? await context.tx.sportsTournament.findFirst({
            where: { id: tournamentId, deletedAt: null },
            select: { majorEventId: true, shouldIssueCertificate: true },
          })
        : null;
      const majorEventId = this.text(data.majorEventId) ?? current?.majorEventId;
      if (!majorEventId) {
        return null;
      }
      return {
        id: tournamentId,
        majorEventId,
        majorEventName: await this.lookupMajorEventName(majorEventId, context),
        shouldIssueCertificate:
          this.boolean(data.shouldIssueCertificate) ??
          (
            await context.tx.sportsTournament.findFirst({
              where: { id: tournamentId, deletedAt: null },
              select: { shouldIssueCertificate: true },
            })
          )?.shouldIssueCertificate ??
          current?.shouldIssueCertificate ??
          false,
      };
    }
    const row = await context.tx.sportsTournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
      select: {
        id: true,
        majorEventId: true,
        shouldIssueCertificate: true,
        majorEvent: { select: { name: true } },
      },
    });
    return row
      ? {
          id: row.id,
          majorEventId: row.majorEventId,
          majorEventName: row.majorEvent.name,
          shouldIssueCertificate: row.shouldIssueCertificate,
        }
      : null;
  }

  private async lookupMajorEventName(
    majorEventId: string,
    context: TransferAdapterContext,
  ): Promise<string | undefined> {
    const source = this.findDocumentResource(context.document, 'major-event', (item) => item.id === majorEventId);
    const sourceName = source ? this.text(this.data(source).name) : null;
    if (sourceName) {
      return sourceName;
    }
    const row = await context.tx.majorEvent.findFirst({
      where: { id: majorEventId, deletedAt: null },
      select: { name: true },
    });
    return row?.name;
  }

  private async lookupCategory(
    categoryId: string,
    context: TransferAdapterContext,
  ): Promise<{ id: string; tournamentId: string; eventGroupId: string; majorEventId: string } | null> {
    const source = this.findDocumentResource(context.document, 'sports-category', (item) => item.id === categoryId);
    if (source) {
      const data = this.data(source);
      const needsCurrent = data.tournamentId === undefined || data.eventGroupId === undefined;
      const current = needsCurrent
        ? await context.tx.sportsCategory.findFirst({
            where: { id: categoryId, deletedAt: null },
            select: { tournamentId: true, eventGroupId: true },
          })
        : null;
      const tournamentId = this.text(data.tournamentId) ?? current?.tournamentId;
      const eventGroupId = this.text(data.eventGroupId) ?? current?.eventGroupId;
      const tournament = tournamentId ? await this.lookupTournament(tournamentId, context) : null;
      if (!tournamentId || !eventGroupId || !tournament) {
        return null;
      }
      return { id: categoryId, tournamentId, eventGroupId, majorEventId: tournament.majorEventId };
    }
    const row = await context.tx.sportsCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: {
        id: true,
        tournamentId: true,
        eventGroupId: true,
        tournament: { select: { majorEventId: true } },
      },
    });
    return row
      ? {
          id: row.id,
          tournamentId: row.tournamentId,
          eventGroupId: row.eventGroupId,
          majorEventId: row.tournament.majorEventId,
        }
      : null;
  }

  private async lookupGroup(
    eventGroupId: string,
    context: TransferAdapterContext,
  ): Promise<{ id: string; majorEventId: string | null } | null> {
    const source = this.findDocumentResource(context.document, 'group', (item) => item.id === eventGroupId);
    if (source) {
      const data = this.data(source);
      if (data.majorEventId !== undefined) {
        return { id: eventGroupId, majorEventId: this.text(data.majorEventId) };
      }
    }
    const row = await context.tx.eventGroup.findFirst({
      where: { id: eventGroupId, deletedAt: null },
      select: { id: true, majorEventId: true },
    });
    return row ?? null;
  }

  private async resolveTournament(resource: TransferResource, context: TransferAdapterContext) {
    const data = this.data(resource);
    const current = await context.tx.sportsTournament.findFirst({
      where: { id: resource.id, deletedAt: null },
      include: { majorEvent: { select: { name: true } } },
    });
    const majorEventId = current?.majorEventId ?? this.text(data.majorEventId);
    const identityConflict =
      !current && majorEventId
        ? await context.tx.sportsTournament.findFirst({
            where: { majorEventId, deletedAt: null },
            select: { id: true },
          })
        : null;
    const snapshot = this.snapshot(
      resource,
      current ? this.tournamentResource(current) : null,
      current ? String(current.revision) : null,
      { ...(majorEventId ? { majorEventId } : {}) },
      this.referenceIfPresent(context.document, 'major-event', majorEventId),
      identityConflict
        ? { message: 'Já existe uma configuração esportiva para o grande evento selecionado.' }
        : undefined,
      majorEventId ? `sports-tournament:${majorEventId}` : undefined,
    );
    await this.assertRead(snapshot, context);
    return snapshot;
  }

  private async resolveCategory(resource: TransferResource, context: TransferAdapterContext) {
    const data = this.data(resource);
    const current = await context.tx.sportsCategory.findFirst({
      where: { id: resource.id, deletedAt: null },
      include: {
        eventGroup: true,
        tournament: { include: { majorEvent: { select: { name: true } } } },
      },
    });
    const tournamentId = current?.tournamentId ?? this.text(data.tournamentId);
    const eventGroupId = current?.eventGroupId ?? this.text(data.eventGroupId);
    const tournament = tournamentId ? await this.lookupTournament(tournamentId, context) : null;
    const group = eventGroupId ? await this.lookupGroup(eventGroupId, context) : null;
    const duplicate =
      !current && eventGroupId
        ? await context.tx.sportsCategory.findFirst({
            where: { eventGroupId, deletedAt: null },
            select: { id: true },
          })
        : null;
    const snapshot = this.snapshot(
      resource,
      current ? this.categoryResource(current) : null,
      current ? String(current.revision) : null,
      {
        ...(tournamentId ? { sportsTournamentId: tournamentId } : {}),
        ...(eventGroupId ? { eventGroupId } : {}),
        ...(tournament?.majorEventId ? { majorEventId: tournament.majorEventId } : {}),
      },
      [
        ...this.referenceIfPresent(context.document, 'sports-tournament', tournamentId),
        ...this.referenceIfPresent(context.document, 'group', eventGroupId),
        ...this.referenceIfPresent(context.document, 'event-form', this.text(data.registrationFormId)),
      ],
      duplicate ? { message: 'O grupo selecionado já pertence a outra modalidade.' } : undefined,
      eventGroupId ? `sports-category:${eventGroupId}` : undefined,
    );
    const proposedGroup = eventGroupId
      ? this.findDocumentResource(context.document, 'group', (item) => item.id === eventGroupId)
      : undefined;
    if (current && proposedGroup) {
      snapshot.additionalChanges = this.additionalResourceChanges(
        this.groupResource(current.eventGroup),
        proposedGroup,
        'group',
      );
    }
    if (!tournament) {
      snapshot.skip ??= { message: 'A modalidade depende de um torneio disponível.' };
    }
    if (
      !group &&
      eventGroupId &&
      this.findDocumentResource(context.document, 'group', (item) => item.id === eventGroupId)
    ) {
      snapshot.skip ??= { message: 'O grupo de apoio não está disponível para esta modalidade.' };
    }
    await this.assertRead(snapshot, context);
    if (current && proposedGroup) {
      snapshot.relatedRevisions = [
        { kind: 'group', id: current.eventGroupId, revision: current.eventGroup.updatedAt.toISOString() },
      ];
      await this.planCategoryCertificateCascade(snapshot, proposedGroup, context);
    }
    return snapshot;
  }

  private async resolveVenue(resource: TransferResource, context: TransferAdapterContext) {
    const data = this.data(resource);
    const current = await context.tx.sportsVenue.findFirst({
      where: { id: resource.id, deletedAt: null },
      include: { tournament: true, placePreset: true },
    });
    const tournamentId = current?.tournamentId ?? this.text(data.tournamentId);
    const tournament = tournamentId ? await this.lookupTournament(tournamentId, context) : null;
    const snapshot = this.snapshot(
      resource,
      current ? this.venueResource(current) : null,
      current ? String(current.revision) : null,
      {
        ...(tournamentId ? { sportsTournamentId: tournamentId } : {}),
        ...(tournament?.majorEventId ? { majorEventId: tournament.majorEventId } : {}),
      },
      [
        ...this.referenceIfPresent(context.document, 'sports-tournament', tournamentId),
        ...this.referenceIfPresent(context.document, 'sports-venue', this.text(data.parentVenueId)),
        ...this.referenceIfPresent(context.document, 'place-preset', this.text(data.placePresetId)),
      ],
    );
    if (!tournament) {
      snapshot.skip = { message: 'O local esportivo depende de um torneio disponível.' };
    }
    await this.assertRead(snapshot, context);
    return snapshot;
  }

  private async planCategoryCertificateCascade(
    snapshot: ResolvedTransferResource,
    group: TransferResource,
    context: TransferAdapterContext,
  ): Promise<void> {
    const data = this.data(snapshot.resource);
    const groupData = this.data(group);
    const tournamentId = this.text(data.tournamentId) ?? this.text(this.data(snapshot.current).tournamentId);
    const tournament = tournamentId ? await this.lookupTournament(tournamentId, context) : null;
    const patch = normalizeEventCertificateSettings({
      ...(data.shouldIssueCertificate !== undefined
        ? {
            shouldIssueCertificate:
              this.nullableBoolean(data.shouldIssueCertificate) ?? tournament?.shouldIssueCertificate ?? false,
          }
        : {}),
      ...(groupData.shouldIssueCertificateForNonPayingAttendees === false
        ? { shouldIssueCertificateForNonPayingAttendees: false }
        : {}),
      ...(groupData.shouldIssueCertificateForNonSubscribedAttendees === false
        ? { shouldIssueCertificateForNonSubscribedAttendees: false }
        : {}),
    });
    if (Object.keys(patch).length === 0) return;
    const events = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      context.tx.event.findMany({
        where: { eventGroupId: group.id, sportsMatch: { isNot: null }, deletedAt: null },
        select: {
          id: true,
          name: true,
          updatedAt: true,
          shouldIssueCertificate: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
        },
        take: TRANSFER_MAX_RESOURCES + 1,
      }),
    );
    if (events.length > TRANSFER_MAX_RESOURCES)
      throw new TransferValidationException('Esta modalidade afeta mais de 500 partidas. Use um contexto menor.');
    const fields = Object.keys(patch) as Array<keyof typeof patch>;
    const changes: TransferChange[] = [];
    for (const event of events) {
      if (!fields.some((field) => event[field] !== patch[field])) continue;
      await this.authorization.assertPermissions(context.actor, [Permission.Event.Read, Permission.Event.Update], {
        eventId: event.id,
      });
      await context.frozenResources.assertEventMutable(event.id, context.actor, 'edit');
      changes.push({
        field: `Certificados da partida: ${event.name}`,
        before: Object.fromEntries(fields.map((field) => [field, event[field]])),
        after: Object.fromEntries(fields.map((field) => [field, patch[field]])) as JsonValue,
      });
    }
    snapshot.relatedRevisions = [
      ...(snapshot.relatedRevisions ?? []),
      ...events.map((event) => ({ kind: 'event' as const, id: event.id, revision: event.updatedAt.toISOString() })),
    ];
    snapshot.additionalChanges = [...(snapshot.additionalChanges ?? []), ...changes];
  }

  private async resolveStage(resource: TransferResource, context: TransferAdapterContext) {
    const data = this.data(resource);
    const current = await context.tx.sportsStage.findFirst({
      where: { id: resource.id, deletedAt: null },
      include: { category: { include: { tournament: { select: { majorEventId: true } } } } },
    });
    const categoryId = current?.categoryId ?? this.text(data.categoryId);
    const category = categoryId ? await this.lookupCategory(categoryId, context) : null;
    const snapshot = this.snapshot(
      resource,
      current ? this.stageResource(current) : null,
      current ? current.updatedAt.toISOString() : null,
      {
        ...(categoryId ? { sportsCategoryId: categoryId } : {}),
        ...(category?.eventGroupId ? { eventGroupId: category.eventGroupId } : {}),
        ...(category?.majorEventId ? { majorEventId: category.majorEventId } : {}),
      },
      this.referenceIfPresent(context.document, 'sports-category', categoryId),
    );
    if (!category) {
      snapshot.skip = { message: 'A etapa depende de uma modalidade disponível.' };
    }
    await this.assertRead(snapshot, context);
    return snapshot;
  }

  private async resolveMatch(resource: TransferResource, context: TransferAdapterContext) {
    const data = this.data(resource);
    const current = await context.tx.sportsMatch.findFirst({
      where: { id: resource.id, deletedAt: null },
      include: {
        event: true,
        category: { include: { tournament: { select: { majorEventId: true } }, eventGroup: true } },
        stage: true,
        venue: { include: { placePreset: true } },
      },
    });
    const eventId = current?.eventId ?? this.text(data.eventId);
    const categoryId = current?.categoryId ?? this.text(data.categoryId);
    const category = categoryId ? await this.lookupCategory(categoryId, context) : null;
    const event = eventId
      ? await context.tx.event.findFirst({
          where: { id: eventId, deletedAt: null },
          include: { sportsMatch: { select: { id: true } } },
        })
      : null;
    const eventClaimedByOtherMatch = Boolean(event?.sportsMatch && event.sportsMatch.id !== resource.id);
    const snapshot = this.snapshot(
      resource,
      current ? this.matchResource(current) : null,
      current ? this.matchRevision(current) : null,
      {
        ...(current ? { sportsMatchId: current.id } : {}),
        ...(categoryId ? { sportsCategoryId: categoryId } : {}),
        ...(category?.eventGroupId ? { eventGroupId: category.eventGroupId } : {}),
        ...(category?.majorEventId ? { majorEventId: category.majorEventId } : {}),
        ...(eventId ? { eventId } : {}),
      },
      [
        ...this.referenceIfPresent(context.document, 'sports-category', categoryId),
        ...this.referenceIfPresent(context.document, 'sports-stage', this.text(data.stageId)),
        ...this.referenceIfPresent(context.document, 'sports-venue', this.text(data.venueId)),
        ...this.referenceIfPresent(context.document, 'event', eventId),
      ],
      eventClaimedByOtherMatch ? { message: 'O evento de apoio já está vinculado a outra partida.' } : undefined,
      eventId ? `sports-match:${eventId}` : undefined,
    );
    const proposedEvent = eventId
      ? this.findDocumentResource(context.document, 'event', (item) => item.id === eventId)
      : undefined;
    if (current && proposedEvent) {
      snapshot.additionalChanges = this.additionalResourceChanges(
        this.backingEventResource(current.event),
        proposedEvent,
        'event',
      );
    }
    if (!category) {
      snapshot.skip ??= { message: 'A partida depende de uma modalidade disponível.' };
    }
    if (!current && event && !event.sportsMatch) {
      snapshot.skip ??= { message: 'O ID do evento de apoio já pertence a um evento independente.' };
    }
    await this.assertRead(snapshot, context);
    return snapshot;
  }

  private async resolveBackingGroup(resource: TransferResource, context: TransferAdapterContext) {
    const current = await context.tx.eventGroup.findFirst({
      where: { id: resource.id, deletedAt: null },
    });
    const ownerResource = this.findDocumentResource(
      context.document,
      'sports-category',
      (item) => this.text(this.data(item).eventGroupId) === resource.id,
    );
    const currentCategory = current
      ? await context.tx.sportsCategory.findFirst({
          where: { eventGroupId: resource.id, deletedAt: null },
          include: { tournament: { select: { majorEventId: true } } },
        })
      : null;
    const ownerId = ownerResource?.id ?? currentCategory?.id;
    const tournamentId = ownerResource
      ? this.text(this.data(ownerResource).tournamentId)
      : currentCategory?.tournamentId;
    const tournament = tournamentId ? await this.lookupTournament(tournamentId, context) : null;
    const snapshot = this.snapshot(
      resource,
      current ? this.groupResource(current) : null,
      current ? current.updatedAt.toISOString() : null,
      {
        ...(resource.id ? { eventGroupId: resource.id } : {}),
        ...(ownerId ? { sportsCategoryId: ownerId } : {}),
        ...(tournament?.majorEventId ? { majorEventId: tournament.majorEventId } : {}),
        ...(tournamentId ? { sportsTournamentId: tournamentId } : {}),
      },
      ownerId ? [{ kind: 'sports-category', id: ownerId }] : [],
      !ownerResource
        ? { message: 'O grupo de apoio precisa ser transferido junto com a modalidade esportiva.' }
        : undefined,
      undefined,
      ownerResource ? { kind: 'sports-category', id: ownerResource.id } : undefined,
    );
    await this.assertRead(snapshot, context);
    return snapshot;
  }

  private async resolveBackingEvent(resource: TransferResource, context: TransferAdapterContext) {
    const current = await context.tx.event.findFirst({
      where: { id: resource.id, deletedAt: null },
    });
    const ownerResource = this.findDocumentResource(
      context.document,
      'sports-match',
      (item) => this.text(this.data(item).eventId) === resource.id,
    );
    const currentMatch = current
      ? await context.tx.sportsMatch.findFirst({
          where: { eventId: resource.id, deletedAt: null },
          include: { category: { include: { tournament: { select: { majorEventId: true } } } } },
        })
      : null;
    const ownerId = ownerResource?.id ?? currentMatch?.id;
    const categoryId = ownerResource ? this.text(this.data(ownerResource).categoryId) : currentMatch?.categoryId;
    const category = categoryId ? await this.lookupCategory(categoryId, context) : null;
    const snapshot = this.snapshot(
      resource,
      current ? this.backingEventResource(current) : null,
      current ? current.updatedAt.toISOString() : null,
      {
        eventId: resource.id,
        ...(ownerId ? { sportsMatchId: ownerId } : {}),
        ...(categoryId ? { sportsCategoryId: categoryId } : {}),
        ...(category?.eventGroupId ? { eventGroupId: category.eventGroupId } : {}),
        ...(category?.majorEventId ? { majorEventId: category.majorEventId } : {}),
      },
      ownerId ? [{ kind: 'sports-match', id: ownerId }] : [],
      !ownerResource
        ? { message: 'O evento de apoio precisa ser transferido junto com a partida esportiva.' }
        : undefined,
      undefined,
      ownerResource ? { kind: 'sports-match', id: ownerResource.id } : undefined,
    );
    await this.assertRead(snapshot, context);
    return snapshot;
  }

  private async applyTournament(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const data = this.data(snapshot.resource);
    const scopedAdmin = this.admin.forTransaction(context.tx);
    const record =
      action === 'create'
        ? await scopedAdmin.attachTournament(
            {
              id: snapshot.resource.id,
              majorEventId: this.requiredText(data.majorEventId, 'majorEventId'),
              ...this.tournamentInput(data),
            },
            context.actor,
          )
        : await scopedAdmin.updateTournament(
            snapshot.resource.id,
            {
              expectedRevision: this.requiredRevision(snapshot.revision),
              ...this.tournamentInput(data),
            },
            context.actor,
          );
    return {
      revision: String(record.revision),
      postCommitEffects: [() => this.mutationEvents.publishForEntity('TOURNAMENT', record.id, true)],
    };
  }

  private async applyCategory(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const data = this.data(snapshot.resource);
    const create = action === 'create';
    const current = this.data(snapshot.current);
    const eventGroupId = this.text(data.eventGroupId) ?? this.text(current.eventGroupId);
    const groupResource = this.findDocumentResource(
      context.document,
      'group',
      (resource) => resource.id === eventGroupId,
    );
    const rawGroupSettings = groupResource ? this.groupSettings(this.data(groupResource)) : undefined;
    const backingEventGroup =
      rawGroupSettings && Object.keys(rawGroupSettings).length > 0 ? rawGroupSettings : undefined;
    const shouldIssueCertificate = this.nullableBoolean(data.shouldIssueCertificate);
    const fields = {
      name: create ? this.requiredText(data.name, 'name') : this.requiredTextIfPresent(data.name, 'name'),
      emoji: data.emoji === undefined ? undefined : (this.text(data.emoji) ?? undefined),
      sport: (create ? this.requiredText(data.sport, 'sport') : this.requiredTextIfPresent(data.sport, 'sport')) as
        | SportsPreset
        | undefined,
      customSportName: this.nullableText(data.customSportName),
      division: this.nullableText(data.division),
      format: (create
        ? this.requiredText(data.format, 'format')
        : this.requiredTextIfPresent(data.format, 'format')) as SportsFormat | undefined,
      registrationStartDate: this.nullableDate(data.registrationStartDate),
      registrationEndDate: this.nullableDate(data.registrationEndDate),
      minimumRosterSize: this.nullableNumber(data.minimumRosterSize),
      maximumRosterSize: this.nullableNumber(data.maximumRosterSize),
      maximumCaptains: this.nullableNumber(data.maximumCaptains),
      maximumCoaches: this.nullableNumber(data.maximumCoaches),
      allowPlayerMultipleTeams: this.nullableBoolean(data.allowPlayerMultipleTeams),
      shouldIssueCertificate,
      athleteIdentifierMode:
        data.athleteIdentifierMode === undefined
          ? undefined
          : (this.requiredText(data.athleteIdentifierMode, 'athleteIdentifierMode') as SportsAthleteIdentifierMode),
      joiningInstructions: this.nullableText(data.joiningInstructions),
      periodsEnabled: this.boolean(data.periodsEnabled),
      maximumPeriods: this.nullableNumber(data.maximumPeriods),
      periodLabel: this.nullableText(data.periodLabel),
      timerRules: data.timerRules === undefined ? undefined : (data.timerRules as Prisma.InputJsonValue),
      scoreRules: data.scoreRules === undefined ? undefined : (data.scoreRules as Prisma.InputJsonValue),
      overallScoringRules:
        data.overallScoringRules === undefined ? undefined : (data.overallScoringRules as Prisma.InputJsonValue),
      rosterRules: data.rosterRules === undefined ? undefined : (data.rosterRules as Prisma.InputJsonValue),
      bracketRules: data.bracketRules === undefined ? undefined : (data.bracketRules as Prisma.InputJsonValue),
      standingsRules: data.standingsRules === undefined ? undefined : (data.standingsRules as Prisma.InputJsonValue),
      rulesText: this.nullableText(data.rulesText),
      registrationFormId: this.nullableText(data.registrationFormId),
      backingEventGroup,
    };
    const scopedAdmin = this.admin.forTransaction(context.tx);
    const record = create
      ? await scopedAdmin.createCategory(
          {
            ...fields,
            id: snapshot.resource.id,
            tournamentId: this.requiredText(data.tournamentId, 'tournamentId'),
            eventGroupId: this.requiredText(data.eventGroupId, 'eventGroupId'),
            initializeTeamRegistrations: false,
            name: this.requiredText(data.name, 'name'),
            sport: this.requiredText(data.sport, 'sport') as SportsPreset,
            format: this.requiredText(data.format, 'format') as SportsFormat,
            scoreRules: data.scoreRules as Prisma.InputJsonValue,
            rosterRules: data.rosterRules as Prisma.InputJsonValue,
            bracketRules: data.bracketRules as Prisma.InputJsonValue,
            standingsRules: data.standingsRules as Prisma.InputJsonValue,
          },
          context.actor,
        )
      : await scopedAdmin.updateCategory(
          snapshot.resource.id,
          {
            ...fields,
            expectedRevision: this.requiredRevision(snapshot.revision),
          },
          context.actor,
        );
    return {
      revision: String(record.revision),
      postCommitEffects: [() => this.mutationEvents.publishForEntity('CATEGORY', record.id, true)],
    };
  }

  private async applyVenue(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const data = this.data(snapshot.resource);
    const create = action === 'create';
    const tournamentId = this.text(data.tournamentId) ?? this.text(this.data(snapshot.current).tournamentId);
    const fields = {
      placePresetId: create
        ? this.requiredText(data.placePresetId, 'placePresetId')
        : this.requiredTextIfPresent(data.placePresetId, 'placePresetId'),
      name: create ? this.requiredText(data.name, 'name') : this.requiredTextIfPresent(data.name, 'name'),
      courtLabel: this.nullableText(data.courtLabel),
      capacity: this.nullableNumber(data.capacity),
      notes: this.nullableText(data.notes),
      parentVenueId: this.nullableText(data.parentVenueId),
    };
    const requiredTournamentId = this.requiredText(tournamentId, 'tournamentId');
    const scopedAdmin = this.admin.forTransaction(context.tx);
    const record = create
      ? await scopedAdmin.createVenue(
          {
            ...fields,
            id: snapshot.resource.id,
            tournamentId: requiredTournamentId,
            placePresetId: this.requiredText(data.placePresetId, 'placePresetId'),
            name: this.requiredText(data.name, 'name'),
          },
          context.actor,
        )
      : await scopedAdmin.updateVenue(
          snapshot.resource.id,
          {
            ...fields,
            tournamentId: requiredTournamentId,
            expectedRevision: this.requiredRevision(snapshot.revision),
          },
          context.actor,
        );
    return {
      revision: String(record.revision),
      postCommitEffects: [() => this.mutationEvents.publishForEntity('VENUE', record.id, true)],
    };
  }

  private async applyStage(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const data = action === 'update' ? this.effectiveData(snapshot) : this.data(snapshot.resource);
    const categoryId = this.requiredText(data.categoryId, 'categoryId');
    const category = await context.tx.sportsCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!category) {
      throw new NotFoundException('A modalidade vinculada à etapa não está disponível.');
    }
    const stageData = {
      name: this.requiredText(data.name, 'name'),
      type: this.requiredText(data.type, 'type') as SportsStageType,
      displayOrder: this.requiredNumber(data.displayOrder, 'displayOrder'),
      settings: this.recordValue(data.settings, 'settings') as Prisma.InputJsonValue,
      updatedById: context.actor.sub,
    };
    if (action === 'create') {
      const stage = await context.tx.sportsStage.create({
        data: {
          id: snapshot.resource.id,
          categoryId,
          ...stageData,
          createdById: context.actor.sub,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SYSTEM,
          entityId: this.stageAuditId(stage.id),
          entityLabel: stage.name,
          operation: AuditLogOperation.IMPORT,
          actor: context.actor,
          after: {
            categoryId,
            name: stage.name,
            type: stage.type,
            displayOrder: stage.displayOrder,
            settings: stage.settings,
          },
          summary: 'Etapa esportiva importada.',
          scope: {
            permission: Permission.SportsCategory.Create,
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
          },
          metadata: { entity: 'sports-stage', id: stage.id },
        },
        context.tx,
      );
      return {
        revision: stage.updatedAt.toISOString(),
        postCommitEffects: [() => this.mutationEvents.publishForEntity('CATEGORY', categoryId, true)],
      };
    }

    const changed = await context.tx.sportsStage.updateMany({
      where: {
        id: snapshot.resource.id,
        categoryId,
        deletedAt: null,
        updatedAt: this.requiredDateRevision(snapshot.revision),
      },
      data: stageData,
    });
    if (changed.count !== 1) {
      throw new ConflictException('A etapa esportiva mudou. Recarregue e tente novamente.');
    }
    const updated = await context.tx.sportsStage.findUniqueOrThrow({ where: { id: snapshot.resource.id } });
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.SYSTEM,
        entityId: this.stageAuditId(updated.id),
        entityLabel: updated.name,
        operation: AuditLogOperation.IMPORT,
        actor: context.actor,
        before: snapshot.current?.data ?? null,
        after: {
          categoryId,
          name: updated.name,
          type: updated.type,
          displayOrder: updated.displayOrder,
          settings: updated.settings,
        },
        summary: 'Etapa esportiva importada.',
        scope: {
          permission: Permission.SportsCategory.Update,
          majorEventId: category.tournament.majorEventId,
          eventGroupId: category.eventGroupId,
        },
        metadata: { entity: 'sports-stage', id: updated.id },
      },
      context.tx,
    );
    return {
      revision: updated.updatedAt.toISOString(),
      postCommitEffects: [() => this.mutationEvents.publishForEntity('CATEGORY', categoryId, true)],
    };
  }

  private async applyMatch(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult> {
    const data = this.data(snapshot.resource);
    const eventId = this.text(data.eventId) ?? this.text(this.data(snapshot.current).eventId);
    const backingEvent = this.findDocumentResource(context.document, 'event', (resource) => resource.id === eventId);
    const backingEventData = backingEvent ? this.data(backingEvent) : {};
    const currentData = this.data(snapshot.current);
    const nameValue = this.selectedMatchField(snapshot, data, backingEventData, 'name');
    const startDateValue = this.selectedMatchField(snapshot, data, backingEventData, 'startDate');
    const endDateValue = this.selectedMatchField(snapshot, data, backingEventData, 'endDate');
    const name = this.text(nameValue);
    const startDate = this.date(startDateValue);
    const endDate = this.date(endDateValue);
    const fields = {
      name:
        action === 'create' || this.aliasValueChanged(currentData.name, nameValue) ? (name ?? undefined) : undefined,
      startDate:
        action === 'create' || this.aliasValueChanged(currentData.startDate, startDateValue)
          ? (startDate ?? undefined)
          : undefined,
      endDate:
        action === 'create' || this.aliasValueChanged(currentData.endDate, endDateValue)
          ? (endDate ?? undefined)
          : undefined,
      stageId: this.nullableText(data.stageId),
      venueId: this.nullableText(data.venueId),
      notes: this.nullableText(data.notes),
      livestreamProvider: this.nullableText(data.livestreamProvider) as SportsLivestreamProvider | null | undefined,
      livestreamUrl: this.nullableText(data.livestreamUrl),
      roundNumber: this.nullableNumber(data.roundNumber),
      bracketPosition: this.nullableNumber(data.bracketPosition),
      groupKey: this.nullableText(data.groupKey),
    };
    const scopedAdmin = this.admin.forTransaction(context.tx);
    const record =
      action === 'create'
        ? await scopedAdmin.createMatch(
            {
              ...fields,
              id: snapshot.resource.id,
              categoryId: this.requiredText(data.categoryId, 'categoryId'),
              backingEventId: this.requiredText(data.eventId, 'eventId'),
              forceBackingEventDraft: true,
              startDate: this.requiredDate(startDate),
              endDate: this.requiredDate(endDate),
            },
            context.actor,
          )
        : await scopedAdmin.updateMatch(
            snapshot.resource.id,
            {
              expectedRevision: this.matchRevisionNumber(snapshot.revision),
              ...fields,
            },
            context.actor,
          );
    return {
      revision: this.matchRevision(record),
      postCommitEffects: [() => this.mutationEvents.publishForEntity('MATCH', record.id, true)],
    };
  }

  private async assertCategoryReferencesReadable(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    scope = snapshot.scope,
  ): Promise<void> {
    const data = this.data(snapshot.resource);
    const formId = this.text(data.registrationFormId);
    if (formId) {
      await this.assertPermission(context, Permission.EventForm.Read, { ...scope, eventFormId: formId });
    }
  }

  private async assertMatchReferencesReadable(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    scope = snapshot.scope,
  ): Promise<void> {
    const data = this.data(snapshot.resource);
    const stageId = this.text(data.stageId);
    const venueId = this.text(data.venueId);
    if (stageId) {
      await this.assertPermission(context, Permission.SportsCategory.Read, scope);
    }
    if (venueId) {
      await this.assertPermission(context, Permission.SportsTournament.Read, scope);
      await this.assertPermission(context, Permission.PlacePreset.Read, {});
    }
  }

  private async authorizationScope(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<TransferAuthorizationScope> {
    if (snapshot.current) return snapshot.scope;
    const ancestors = await this.existingAncestorScope(snapshot, context);
    if (ancestors.sportsCategoryId) return { sportsCategoryId: ancestors.sportsCategoryId };
    if (ancestors.eventGroupId) return { eventGroupId: ancestors.eventGroupId };
    if (ancestors.sportsTournamentId) return { sportsTournamentId: ancestors.sportsTournamentId };
    if (ancestors.majorEventId) return { majorEventId: ancestors.majorEventId };
    return {};
  }

  /**
   * Proposed document IDs are not authorization targets until their rows exist.
   * Resolve only the nearest persisted ancestor so the policy does not turn a
   * new ID into an audience-count lookup or mistake it for an existing scope.
   */
  private async existingAncestorScope(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<TransferAuthorizationScope> {
    if (snapshot.current) return snapshot.scope;
    const proposed = snapshot.scope;

    if (proposed.sportsCategoryId) {
      const category = await context.tx.sportsCategory.findFirst({
        where: { id: proposed.sportsCategoryId, deletedAt: null },
        select: {
          id: true,
          eventGroupId: true,
          tournamentId: true,
          tournament: { select: { majorEventId: true } },
        },
      });
      if (category) {
        return {
          sportsCategoryId: category.id,
          eventGroupId: category.eventGroupId,
          sportsTournamentId: category.tournamentId,
          majorEventId: category.tournament.majorEventId,
        };
      }
    }

    if (proposed.eventGroupId) {
      const group = await context.tx.eventGroup.findFirst({
        where: { id: proposed.eventGroupId, deletedAt: null },
        select: { id: true, majorEventId: true },
      });
      if (group) {
        return {
          eventGroupId: group.id,
          ...(group.majorEventId ? { majorEventId: group.majorEventId } : {}),
        };
      }
    }

    if (proposed.sportsTournamentId) {
      const tournament = await context.tx.sportsTournament.findFirst({
        where: { id: proposed.sportsTournamentId, deletedAt: null },
        select: { id: true, majorEventId: true },
      });
      if (tournament) {
        return { sportsTournamentId: tournament.id, majorEventId: tournament.majorEventId };
      }
    }

    if (proposed.majorEventId) {
      const majorEvent = await context.tx.majorEvent.findFirst({
        where: { id: proposed.majorEventId, deletedAt: null },
        select: { id: true },
      });
      if (majorEvent) return { majorEventId: majorEvent.id };
    }

    return {};
  }

  private async assertPermission(
    context: TransferAdapterContext,
    permission: PermissionType,
    scope: AuthorizationResourceContext,
  ): Promise<void> {
    await this.authorization.assertPermissions(context.actor, [permission], scope);
  }

  private async assertSnapshotRevision(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<void> {
    if (!snapshot.current || !snapshot.revision) {
      return;
    }
    const current = await this.currentRevision(snapshot.resource, context);
    if (current !== snapshot.revision) {
      throw new ConflictException('A configuração esportiva mudou. Gere uma nova prévia antes de importar.');
    }
  }

  private async currentRevision(resource: TransferResource, context: TransferAdapterContext): Promise<string | null> {
    switch (resource.kind) {
      case 'sports-tournament': {
        const row = await context.tx.sportsTournament.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { revision: true },
        });
        return row ? String(row.revision) : null;
      }
      case 'sports-category': {
        const row = await context.tx.sportsCategory.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { revision: true },
        });
        return row ? String(row.revision) : null;
      }
      case 'sports-venue': {
        const row = await context.tx.sportsVenue.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { revision: true },
        });
        return row ? String(row.revision) : null;
      }
      case 'sports-stage': {
        const row = await context.tx.sportsStage.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { updatedAt: true },
        });
        return row ? row.updatedAt.toISOString() : null;
      }
      case 'sports-match': {
        const row = await context.tx.sportsMatch.findFirst({
          where: { id: resource.id, deletedAt: null },
          include: { event: { select: { updatedAt: true } } },
        });
        return row ? `${row.revision}:${row.event.updatedAt.toISOString()}` : null;
      }
      case 'group': {
        const row = await context.tx.eventGroup.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { updatedAt: true },
        });
        return row ? row.updatedAt.toISOString() : null;
      }
      case 'event': {
        const row = await context.tx.event.findFirst({
          where: { id: resource.id, deletedAt: null },
          select: { updatedAt: true },
        });
        return row ? row.updatedAt.toISOString() : null;
      }
      default:
        return null;
    }
  }

  private async validateTournament(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const data = this.effectiveData(snapshot);
    const majorEventId = this.requiredText(data.majorEventId, 'majorEventId');
    if (snapshot.current) {
      const currentMajorEventId = this.text(this.data(snapshot.current).majorEventId);
      if (currentMajorEventId !== majorEventId) {
        throw new ConflictException('Um torneio existente não pode ser movido para outro grande evento.');
      }
    }
    if (!this.findDocumentResource(context.document, 'major-event', (item) => item.id === majorEventId)) {
      const parent = await context.tx.majorEvent.findFirst({
        where: { id: majorEventId, deletedAt: null },
        select: { id: true },
      });
      if (!parent) {
        throw new NotFoundException('O grande evento vinculado ao torneio não está disponível.');
      }
    }
    this.validateOptionalDatePair(data, 'registrationStartDate', 'registrationEndDate');
  }

  private async validateCategory(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const data = this.effectiveData(snapshot);
    const tournamentId = this.requiredText(data.tournamentId, 'tournamentId');
    const eventGroupId = this.requiredText(data.eventGroupId, 'eventGroupId');
    if (snapshot.current) {
      const current = this.data(snapshot.current);
      if (current.tournamentId !== tournamentId || current.eventGroupId !== eventGroupId) {
        throw new ConflictException('Uma modalidade existente não pode ser movida para outro torneio ou grupo.');
      }
    }
    const tournament = await this.lookupTournament(tournamentId, context);
    if (!tournament) {
      throw new NotFoundException('O torneio vinculado à modalidade não está disponível.');
    }
    const groupResource = this.findDocumentResource(context.document, 'group', (item) => item.id === eventGroupId);
    const group = await this.lookupGroup(eventGroupId, context);
    if (!group && !groupResource) {
      throw new NotFoundException('O grupo de apoio vinculado à modalidade não está disponível.');
    }
    const groupMajorEventId = group?.majorEventId ?? this.text(this.data(groupResource).majorEventId);
    if (groupMajorEventId && groupMajorEventId !== tournament.majorEventId) {
      throw new ConflictException('O grupo de apoio pertence a outro grande evento.');
    }
    if (groupResource) {
      this.assertOnlyKeys(this.data(groupResource), BACKING_GROUP_FIELDS);
      this.validateBackingGroupFields(data, this.data(groupResource), tournament);
    }
    this.validateOptionalDatePair(data, 'registrationStartDate', 'registrationEndDate');
    if (data.sport === 'OTHER' && !this.text(data.customSportName)) {
      throw new TransferValidationException('Informe o nome do esporte personalizado.');
    }
    this.validateCategoryRules(data, snapshot.current === null);
    await this.assertCategoryReferencesReadable(snapshot, context);
  }

  private async validateVenue(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const data = this.effectiveData(snapshot);
    const tournamentId = this.requiredText(data.tournamentId, 'tournamentId');
    const placePresetId = this.requiredText(data.placePresetId, 'placePresetId');
    if (snapshot.current && this.data(snapshot.current).tournamentId !== tournamentId) {
      throw new ConflictException('Um local existente não pode ser movido para outro torneio.');
    }
    if (this.nullableNumber(data.capacity) !== null && !Number.isInteger(this.nullableNumber(data.capacity))) {
      throw new TransferValidationException('A capacidade do local deve ser um inteiro não negativo.');
    }
    const parentVenueId = this.text(data.parentVenueId);
    if (parentVenueId) {
      const parentResource = this.findDocumentResource(
        context.document,
        'sports-venue',
        (item) => item.id === parentVenueId,
      );
      const parent = parentResource
        ? { tournamentId: this.text(this.data(parentResource).tournamentId) }
        : await context.tx.sportsVenue.findFirst({
            where: { id: parentVenueId, deletedAt: null },
            select: { tournamentId: true },
          });
      if (!parent || parent.tournamentId !== tournamentId || parentVenueId === snapshot.resource.id) {
        throw new TransferValidationException('O local pai precisa pertencer ao mesmo torneio.');
      }
    }
    if (!this.findDocumentResource(context.document, 'place-preset', (item) => item.id === placePresetId)) {
      const place = await context.tx.placePreset.findFirst({
        where: { id: placePresetId, deletedAt: null },
        select: { id: true },
      });
      if (!place) {
        throw new NotFoundException('O local base vinculado ao torneio não está disponível.');
      }
    }
  }

  private async validateStage(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const data = this.effectiveData(snapshot);
    const categoryId = this.requiredText(data.categoryId, 'categoryId');
    if (snapshot.current && this.data(snapshot.current).categoryId !== categoryId) {
      throw new ConflictException('Uma etapa existente não pode ser movida para outra modalidade.');
    }
    const settings = this.recordValue(data.settings, 'settings');
    if (!Object.values(SportsStageType).includes(this.requiredText(data.type, 'type') as SportsStageType)) {
      throw new TransferValidationException('O tipo da etapa esportiva não é válido.');
    }
    const displayOrder = this.requiredNumber(data.displayOrder, 'displayOrder');
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new TransferValidationException('A ordem da etapa deve ser um inteiro não negativo.');
    }
    if (snapshot.current) {
      const hasAssignedMatches = await context.tx.sportsMatch.count({
        where: { stageId: snapshot.resource.id, deletedAt: null },
      });
      if (hasAssignedMatches > 0 && JSON.stringify(settings) !== JSON.stringify(this.data(snapshot.current).settings)) {
        throw new ConflictException('As regras de uma etapa com partidas existentes não podem ser substituídas.');
      }
    }
  }

  private async validateMatch(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void> {
    const proposedData = this.data(snapshot.resource);
    const data = this.effectiveData(snapshot);
    const categoryId = this.requiredText(data.categoryId, 'categoryId');
    const eventId = this.requiredText(data.eventId, 'eventId');
    if (snapshot.current) {
      const current = this.data(snapshot.current);
      if (current.categoryId !== categoryId || current.eventId !== eventId) {
        throw new ConflictException('Uma partida existente não pode ser movida para outra modalidade ou evento.');
      }
      const currentMatch = await context.tx.sportsMatch.findFirst({
        where: { id: snapshot.resource.id, deletedAt: null },
        select: { state: true },
      });
      if (currentMatch && currentMatch.state !== SportsMatchState.SCHEDULED) {
        throw new ConflictException('Somente partidas agendadas podem receber alterações de configuração.');
      }
    }
    const category = await this.lookupCategory(categoryId, context);
    if (!category) {
      throw new NotFoundException('A modalidade da partida não está disponível.');
    }
    const eventInDocument = this.findDocumentResource(context.document, 'event', (item) => item.id === eventId);
    const eventData = this.data(eventInDocument);
    const startDate = this.date(this.selectedMatchField(snapshot, proposedData, eventData, 'startDate'));
    const endDate = this.date(this.selectedMatchField(snapshot, proposedData, eventData, 'endDate'));
    if (!startDate || !endDate || endDate <= startDate) {
      throw new TransferValidationException('A partida precisa ter início e fim válidos.');
    }
    const categoryResource = this.findDocumentResource(
      context.document,
      'sports-category',
      (item) => item.id === categoryId,
    );
    const groupResource = this.findDocumentResource(
      context.document,
      'group',
      (item) => item.id === category.eventGroupId,
    );
    const expectedEmoji = this.text(this.data(groupResource).emoji) ?? this.text(this.data(categoryResource).emoji);
    const matchEmoji = this.text(this.selectedMatchField(snapshot, proposedData, eventData, 'emoji'));
    if (matchEmoji && expectedEmoji && matchEmoji !== expectedEmoji) {
      throw new TransferValidationException('O emoji da partida precisa corresponder ao grupo esportivo.');
    }
    await this.validateMatchParentReference(context, 'sports-stage', this.text(data.stageId), { categoryId });
    await this.validateMatchParentReference(context, 'sports-venue', this.text(data.venueId), {
      tournamentId: category.tournamentId,
    });
    const backingEvent = await context.tx.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        sportsMatch: { select: { id: true } },
        _count: { select: { attendances: true, subscriptions: true } },
      },
    });
    if (
      !snapshot.current &&
      backingEvent &&
      (!backingEvent.sportsMatch || backingEvent.sportsMatch.id !== snapshot.resource.id)
    ) {
      throw new ConflictException('O evento de apoio já está associado a outro recurso.');
    }
    if (
      !snapshot.current &&
      backingEvent &&
      (backingEvent._count.attendances > 0 || backingEvent._count.subscriptions > 0)
    ) {
      throw new ConflictException('Um evento com registros operacionais não pode ser convertido em partida.');
    }
    if (eventInDocument) {
      this.assertOnlyKeys(eventData, MATCH_EVENT_FIELDS);
      this.validateBackingEventFields(proposedData, eventData, category, this.data(snapshot.current));
    }
  }

  private async validateBackingGroup(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<void> {
    const data = this.data(snapshot.resource);
    this.assertOnlyKeys(data, BACKING_GROUP_FIELDS);
    const owner = this.findDocumentResource(
      context.document,
      'sports-category',
      (item) => this.text(this.data(item).eventGroupId) === snapshot.resource.id,
    );
    if (!owner) {
      throw new TransferValidationException('O grupo de apoio precisa ser importado junto com a modalidade esportiva.');
    }
    const tournament = await this.lookupTournament(
      this.requiredText(this.data(owner).tournamentId, 'tournamentId'),
      context,
    );
    if (!tournament) {
      throw new NotFoundException('O torneio do grupo de apoio não está disponível.');
    }
    this.validateBackingGroupFields(this.data(owner), data, tournament);
  }

  private async validateBackingEvent(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
  ): Promise<void> {
    const data = this.data(snapshot.resource);
    this.assertOnlyKeys(data, MATCH_EVENT_FIELDS);
    const owner = this.findDocumentResource(
      context.document,
      'sports-match',
      (item) => this.text(this.data(item).eventId) === snapshot.resource.id,
    );
    if (!owner) {
      throw new TransferValidationException('O evento de apoio precisa ser importado junto com a partida esportiva.');
    }
    const category = await this.lookupCategory(this.requiredText(this.data(owner).categoryId, 'categoryId'), context);
    if (!category) {
      throw new NotFoundException('A modalidade da partida não está disponível.');
    }
    this.validateBackingEventFields(this.data(owner), data, category);
  }

  private validateBackingEventFields(
    matchData: PlainRecord,
    eventData: PlainRecord,
    category: { eventGroupId: string; majorEventId: string },
    previousMatchData: PlainRecord = {},
  ): void {
    const expected: PlainRecord = {
      name: this.text(matchData.name),
      emoji: this.text(matchData.emoji),
      startDate: this.date(matchData.startDate)?.toISOString(),
      endDate: this.date(matchData.endDate)?.toISOString(),
      majorEventId: category.majorEventId,
      eventGroupId: category.eventGroupId,
    };
    for (const key of MATCH_EVENT_FIELDS) {
      const actual = eventData[key];
      const proposedMatchValue = matchData[key];
      if (key === 'majorEventId' || key === 'eventGroupId') {
        if (actual !== undefined && actual !== expected[key]) {
          throw new ConflictException('Os dados do evento de apoio divergem da programação da partida.');
        }
        continue;
      }
      if (actual === undefined || proposedMatchValue === undefined) {
        continue;
      }
      const previousValue = previousMatchData[key];
      const matchChanged =
        previousValue !== undefined && this.aliasValueChanged(previousValue, proposedMatchValue, key);
      const eventChanged = previousValue !== undefined && this.aliasValueChanged(previousValue, actual, key);
      const normalizedActual = this.normalizeMatchField(key, actual);
      const normalizedMatch = this.normalizeMatchField(key, proposedMatchValue);
      if (
        matchChanged && eventChanged
          ? canonicalTransferJson(normalizedActual as JsonValue) !== canonicalTransferJson(normalizedMatch as JsonValue)
          : !matchChanged &&
            !eventChanged &&
            canonicalTransferJson(normalizedActual as JsonValue) !== canonicalTransferJson(normalizedMatch as JsonValue)
      ) {
        throw new ConflictException('Os dados do evento de apoio divergem da programação da partida.');
      }
    }
  }

  private validateBackingGroupFields(
    categoryData: PlainRecord,
    groupData: PlainRecord,
    tournament: { majorEventId: string; majorEventName?: string; shouldIssueCertificate?: boolean },
  ): void {
    const expectedName = [
      tournament.majorEventName ?? 'Torneio esportivo',
      this.text(categoryData.name),
      this.text(categoryData.division),
    ]
      .filter(Boolean)
      .join(' — ');
    const expected = {
      name: expectedName,
      emoji: this.text(categoryData.emoji),
      majorEventId: tournament.majorEventId,
      shouldIssueCertificate:
        this.nullableBoolean(categoryData.shouldIssueCertificate) ?? tournament.shouldIssueCertificate ?? false,
    };
    for (const key of ['name', 'emoji', 'majorEventId', 'shouldIssueCertificate'] as const) {
      if (groupData[key] !== undefined && expected[key] !== undefined && groupData[key] !== expected[key]) {
        throw new ConflictException('Os dados do grupo de apoio divergem da modalidade esportiva.');
      }
    }
  }

  private validateCategoryRules(data: PlainRecord, creating: boolean): void {
    if (creating) {
      for (const field of ['scoreRules', 'rosterRules', 'bracketRules', 'standingsRules']) {
        if (data[field] === undefined) {
          throw new TransferValidationException(`${field} é obrigatório para criar a modalidade esportiva.`);
        }
      }
    }
    this.assertJsonRecord(data.timerRules, 'timerRules');
    this.assertJsonRecord(data.scoreRules, 'scoreRules');
    this.assertJsonRecord(data.overallScoringRules, 'overallScoringRules');
    this.assertJsonRecord(data.rosterRules, 'rosterRules');
    this.assertJsonRecord(data.bracketRules, 'bracketRules');
    this.assertJsonRecord(data.standingsRules, 'standingsRules');
    assertSportsTimerRules(data.timerRules ?? {});
    assertSportsScoreRules(data.scoreRules);
    assertSportsOverallScoringRules(data.overallScoringRules ?? {});
  }

  private async validateMatchParentReference(
    context: TransferAdapterContext,
    kind: 'sports-stage' | 'sports-venue',
    id: string | null,
    expected: { categoryId?: string; tournamentId?: string },
  ): Promise<void> {
    if (!id) {
      return;
    }
    const documentResource = this.findDocumentResource(context.document, kind, (item) => item.id === id);
    const field = kind === 'sports-stage' ? 'categoryId' : 'tournamentId';
    const proposed = documentResource ? this.data(documentResource) : {};
    const actual =
      proposed[field] !== undefined
        ? proposed
        : kind === 'sports-stage'
          ? await context.tx.sportsStage.findFirst({ where: { id, deletedAt: null }, select: { categoryId: true } })
          : await context.tx.sportsVenue.findFirst({ where: { id, deletedAt: null }, select: { tournamentId: true } });
    if (!actual) {
      throw new NotFoundException(
        kind === 'sports-stage' ? 'A etapa vinculada não está disponível.' : 'O local vinculado não está disponível.',
      );
    }
    const actualRecord = actual as PlainRecord;
    const actualParent =
      kind === 'sports-stage' ? this.text(actualRecord.categoryId) : this.text(actualRecord.tournamentId);
    const expectedParent = kind === 'sports-stage' ? expected.categoryId : expected.tournamentId;
    if (actualParent !== expectedParent) {
      throw new ConflictException(
        kind === 'sports-stage' ? 'A etapa pertence a outra modalidade.' : 'O local pertence a outro torneio.',
      );
    }
  }

  private snapshot(
    resource: TransferResource,
    current: TransferResource | null,
    revision: string | null,
    scope: TransferAuthorizationScope,
    dependencies: readonly TransferResourceReference[],
    skip?: { message: string },
    identityKey?: string,
    ownedBy?: TransferResourceReference,
  ): ResolvedTransferResource {
    return {
      resource,
      current,
      revision,
      scope,
      dependencies,
      ...(skip ? { skip } : {}),
      ...(identityKey ? { identityKey } : {}),
      ...(ownedBy ? { ownedBy } : {}),
    };
  }

  private effectiveData(snapshot: ResolvedTransferResource): PlainRecord {
    return { ...this.data(snapshot.current), ...this.data(snapshot.resource) };
  }

  private selectedMatchField(
    snapshot: ResolvedTransferResource,
    matchData: PlainRecord,
    eventData: PlainRecord,
    field: string,
  ): unknown {
    const previous = this.data(snapshot.current)[field];
    const matchValue = matchData[field];
    const eventValue = eventData[field];
    if (snapshot.current) {
      const matchChanged = matchValue !== undefined && this.aliasValueChanged(previous, matchValue, field);
      const eventChanged = eventValue !== undefined && this.aliasValueChanged(previous, eventValue, field);
      if (
        matchChanged &&
        eventChanged &&
        canonicalTransferJson(this.normalizeMatchField(field, matchValue) as JsonValue) !==
          canonicalTransferJson(this.normalizeMatchField(field, eventValue) as JsonValue)
      ) {
        throw new ConflictException('Os dados do evento de apoio divergem da programação da partida.');
      }
      if (eventChanged && !matchChanged) {
        return eventValue;
      }
    }
    if (matchValue !== undefined) {
      return matchValue;
    }
    if (eventValue !== undefined) {
      return eventValue;
    }
    return previous;
  }

  private aliasValueChanged(previous: unknown, next: unknown, field?: string): boolean {
    return (
      canonicalTransferJson(this.normalizeMatchField(field ?? '', previous) as JsonValue) !==
      canonicalTransferJson(this.normalizeMatchField(field ?? '', next) as JsonValue)
    );
  }

  private normalizeMatchField(field: string, value: unknown): unknown {
    if (value === undefined || value === null) {
      return value ?? null;
    }
    if (field === 'startDate' || field === 'endDate') {
      return this.date(value)?.toISOString() ?? null;
    }
    return value;
  }

  private additionalResourceChanges(
    current: TransferResource,
    proposed: TransferResource,
    prefix: string,
  ): TransferChange[] {
    const before = this.data(current);
    const after = this.data(proposed);
    return Object.entries(after)
      .filter(
        ([field, value]) =>
          value !== undefined && canonicalTransferJson(before[field] ?? null) !== canonicalTransferJson(value),
      )
      .map(([field, value]) => ({
        field: `${prefix}.${field}`,
        before: (before[field] ?? null) as JsonValue,
        after: value as JsonValue,
      }));
  }

  private resource<K extends TransferResourceKind>(
    kind: K,
    id: string,
    data: PlainRecord,
    revision?: string | null,
  ): TransferResource {
    return {
      kind,
      id,
      data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as never,
      ...(revision ? { revision } : {}),
    } as TransferResource;
  }

  private data(resource: TransferResource | null | undefined): PlainRecord {
    if (!resource || !resource.data || typeof resource.data !== 'object' || Array.isArray(resource.data)) {
      return {};
    }
    return resource.data as PlainRecord;
  }

  private findDocumentResource(
    document: ResolvedTransferDocument,
    kind: TransferResourceKind,
    predicate: (resource: TransferResource) => boolean = () => true,
  ): TransferResource | undefined {
    return document.resources.find((resource) => resource.kind === kind && predicate(resource));
  }

  private referenceIfPresent(
    document: ResolvedTransferDocument,
    kind: TransferResourceKind,
    id: string | null | undefined,
  ): TransferResourceReference[] {
    if (!id || !this.findDocumentResource(document, kind, (resource) => resource.id === id)) {
      return [];
    }
    return [{ kind, id }];
  }

  private assertAllowedDataKeys(resource: TransferResource): void {
    const allowed: Partial<Record<TransferResourceKind, readonly string[]>> = {
      'major-event': [],
      group: [...BACKING_GROUP_FIELDS],
      event: [...MATCH_EVENT_FIELDS],
      'major-event-price': [],
      'price-tier': [],
      'event-attendance': [],
      'major-event-subscription': [],
      'event-subscription': [],
      'group-subscription': [],
      'place-preset': ['name', 'latitude', 'longitude', 'locationDescription'],
      'event-form': [],
      'form-link': [],
      'certificate-config': [],
      'ticket-config': [],
      'ticket-price-option': [],
      'sports-tournament': [
        'majorEventId',
        'registrationStartDate',
        'registrationEndDate',
        'scoringMode',
        'selfSubscriptionEnabled',
        'selfSubscriptionAllowNoTeam',
        'selfSubscriptionAllowNoCategory',
        'allowPlayerMultipleTeams',
        'shouldIssueCertificate',
      ],
      'sports-category': [
        'tournamentId',
        'eventGroupId',
        'name',
        'emoji',
        'sport',
        'customSportName',
        'division',
        'format',
        'registrationStartDate',
        'registrationEndDate',
        'minimumRosterSize',
        'maximumRosterSize',
        'maximumCaptains',
        'maximumCoaches',
        'allowPlayerMultipleTeams',
        'shouldIssueCertificate',
        'athleteIdentifierMode',
        'joiningInstructions',
        'periodsEnabled',
        'maximumPeriods',
        'periodLabel',
        'timerRules',
        'scoreRules',
        'overallScoringRules',
        'rosterRules',
        'bracketRules',
        'standingsRules',
        'rulesText',
        'registrationFormId',
      ],
      'sports-venue': ['tournamentId', 'placePresetId', 'parentVenueId', 'name', 'courtLabel', 'capacity', 'notes'],
      'sports-stage': ['categoryId', 'name', 'type', 'displayOrder', 'settings'],
      'sports-match': [
        'eventId',
        'categoryId',
        'name',
        'emoji',
        'startDate',
        'endDate',
        'stageId',
        'venueId',
        'notes',
        'livestreamProvider',
        'livestreamUrl',
        'roundNumber',
        'bracketPosition',
        'groupKey',
      ],
    };
    this.assertOnlyKeys(this.data(resource), allowed[resource.kind] ?? []);
  }

  private assertOnlyKeys(data: PlainRecord, allowed: ReadonlySet<string> | readonly string[]): void {
    const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
    if (Object.keys(data).some((key) => !allowedSet.has(key))) {
      throw new TransferValidationException('O recurso contém campos que não podem ser importados.');
    }
  }

  private assertRequestedScope(scope: TransferAuthorizationScope, requested?: TransferTarget): void {
    if (!requested) {
      return;
    }
    const matches =
      (requested.kind === 'major-event' && scope.majorEventId === requested.id) ||
      (requested.kind === 'group' && scope.eventGroupId === requested.id) ||
      (requested.kind === 'event' && scope.eventId === requested.id);
    if (!matches) {
      throw new ForbiddenException('O recurso está fora do escopo selecionado.');
    }
  }

  private hasExisting(snapshot: ResolvedTransferResource): boolean {
    return snapshot.current !== null;
  }

  private requiredRevision(value: string | null): number {
    const revision = Number(value);
    if (!Number.isInteger(revision) || revision < 1) {
      throw new ConflictException('A revisão do recurso não está mais disponível. Gere uma nova prévia.');
    }
    return revision;
  }

  private matchRevisionNumber(value: string | null): number {
    const revision = Number(value?.split(':')[0]);
    if (!Number.isInteger(revision) || revision < 1) {
      throw new ConflictException('A revisão da partida não está mais disponível. Gere uma nova prévia.');
    }
    return revision;
  }

  private requiredText(value: unknown, field: string): string {
    const text = this.text(value);
    if (!text) {
      throw new TransferValidationException(`${field} é obrigatório para a configuração esportiva.`);
    }
    return text;
  }

  private requiredTextIfPresent(value: unknown, field: string): string | undefined {
    return value === undefined ? undefined : this.requiredText(value, field);
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private nullableText(value: unknown): string | null | undefined {
    return value === undefined ? undefined : value === null ? null : this.text(value);
  }

  private boolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private nullableBoolean(value: unknown): boolean | null | undefined {
    return value === undefined ? undefined : value === null ? null : this.boolean(value);
  }

  private nullableNumber(value: unknown): number | null | undefined {
    return value === undefined ? undefined : value === null ? null : typeof value === 'number' ? value : undefined;
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TransferValidationException(`${field} deve ser um número válido.`);
    }
    return value;
  }

  private date(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private nullableDate(value: unknown): Date | null | undefined {
    return value === undefined ? undefined : value === null ? null : this.date(value);
  }

  private requiredDate(value: Date | null): Date {
    if (!value) {
      throw new TransferValidationException('Informe uma data de programação válida.');
    }
    return value;
  }

  private requiredDateRevision(value: string | null): Date {
    const parsed = this.date(value);
    if (!parsed) {
      throw new ConflictException('A revisão do recurso não está mais disponível. Gere uma nova prévia.');
    }
    return parsed;
  }

  private recordValue(value: unknown, field: string): PlainRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TransferValidationException(`${field} deve ser um objeto JSON.`);
    }
    return value as PlainRecord;
  }

  private assertJsonRecord(value: unknown, field: string): void {
    if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
      throw new TransferValidationException(`${field} deve ser um objeto JSON.`);
    }
  }

  private validateOptionalDatePair(data: PlainRecord, startKey: string, endKey: string): void {
    const startRaw = data[startKey];
    const endRaw = data[endKey];
    if (startRaw === undefined && endRaw === undefined) {
      return;
    }
    const start = this.date(startRaw);
    const end = this.date(endRaw);
    if (!startRaw || !endRaw || !start || !end || end <= start) {
      throw new TransferValidationException('O período esportivo precisa ter datas válidas em ordem.');
    }
  }

  private stageAuditId(id: string): string {
    return `sports-stage:${id}`;
  }

  private scopeForTournament(tournament: { id: string; majorEventId: string }): TransferAuthorizationScope {
    return { sportsTournamentId: tournament.id, majorEventId: tournament.majorEventId };
  }

  private scopeForCategory(category: {
    id: string;
    tournamentId: string;
    eventGroupId: string;
    tournament: { majorEventId: string };
  }): TransferAuthorizationScope {
    return {
      sportsCategoryId: category.id,
      sportsTournamentId: category.tournamentId,
      eventGroupId: category.eventGroupId,
      majorEventId: category.tournament.majorEventId,
    };
  }

  private scopeForMatch(match: {
    id: string;
    eventId: string;
    categoryId: string;
    category: { eventGroupId: string; tournament: { majorEventId: string } };
  }): TransferAuthorizationScope {
    return {
      sportsMatchId: match.id,
      sportsCategoryId: match.categoryId,
      eventId: match.eventId,
      eventGroupId: match.category.eventGroupId,
      majorEventId: match.category.tournament.majorEventId,
    };
  }

  private tournamentResource(tournament: {
    id: string;
    majorEventId: string;
    registrationStartDate: Date | null;
    registrationEndDate: Date | null;
    scoringMode: string;
    selfSubscriptionEnabled: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    allowPlayerMultipleTeams: boolean;
    shouldIssueCertificate: boolean;
    revision: number;
    updatedAt: Date;
  }): TransferResource {
    return this.resource(
      'sports-tournament',
      tournament.id,
      {
        majorEventId: tournament.majorEventId,
        registrationStartDate: this.iso(tournament.registrationStartDate),
        registrationEndDate: this.iso(tournament.registrationEndDate),
        scoringMode: tournament.scoringMode,
        selfSubscriptionEnabled: tournament.selfSubscriptionEnabled,
        selfSubscriptionAllowNoTeam: tournament.selfSubscriptionAllowNoTeam,
        selfSubscriptionAllowNoCategory: tournament.selfSubscriptionAllowNoCategory,
        allowPlayerMultipleTeams: tournament.allowPlayerMultipleTeams,
        shouldIssueCertificate: tournament.shouldIssueCertificate,
      },
      tournament.updatedAt.toISOString(),
    );
  }

  private categoryResource(category: {
    id: string;
    tournamentId: string;
    eventGroupId: string;
    name: string;
    sport: string;
    customSportName: string | null;
    division: string | null;
    format: string;
    registrationStartDate: Date | null;
    registrationEndDate: Date | null;
    minimumRosterSize: number | null;
    maximumRosterSize: number | null;
    maximumCaptains: number | null;
    maximumCoaches: number | null;
    allowPlayerMultipleTeams: boolean | null;
    shouldIssueCertificate: boolean | null;
    athleteIdentifierMode: string;
    joiningInstructions: string | null;
    periodsEnabled: boolean;
    maximumPeriods: number | null;
    periodLabel: string | null;
    timerRules: Prisma.JsonValue;
    scoreRules: Prisma.JsonValue;
    overallScoringRules: Prisma.JsonValue;
    rosterRules: Prisma.JsonValue;
    bracketRules: Prisma.JsonValue;
    standingsRules: Prisma.JsonValue;
    rulesText: string | null;
    registrationFormId: string | null;
    revision: number;
    updatedAt: Date;
    eventGroup: { emoji: string };
  }): TransferResource {
    return this.resource(
      'sports-category',
      category.id,
      {
        tournamentId: category.tournamentId,
        eventGroupId: category.eventGroupId,
        name: category.name,
        ...(typeof category.eventGroup.emoji === 'string' ? { emoji: category.eventGroup.emoji } : {}),
        sport: category.sport,
        customSportName: category.customSportName,
        division: category.division,
        format: category.format,
        registrationStartDate: this.iso(category.registrationStartDate),
        registrationEndDate: this.iso(category.registrationEndDate),
        minimumRosterSize: category.minimumRosterSize,
        maximumRosterSize: category.maximumRosterSize,
        maximumCaptains: category.maximumCaptains,
        maximumCoaches: category.maximumCoaches,
        allowPlayerMultipleTeams: category.allowPlayerMultipleTeams,
        shouldIssueCertificate: category.shouldIssueCertificate,
        athleteIdentifierMode: category.athleteIdentifierMode,
        joiningInstructions: category.joiningInstructions,
        periodsEnabled: category.periodsEnabled,
        maximumPeriods: category.maximumPeriods,
        periodLabel: category.periodLabel,
        timerRules: this.toJsonValue(category.timerRules),
        scoreRules: this.toJsonValue(category.scoreRules),
        overallScoringRules: this.toJsonValue(category.overallScoringRules),
        rosterRules: this.toJsonValue(category.rosterRules),
        bracketRules: this.toJsonValue(category.bracketRules),
        standingsRules: this.toJsonValue(category.standingsRules),
        rulesText: category.rulesText,
        registrationFormId: category.registrationFormId,
      },
      category.updatedAt.toISOString(),
    );
  }

  private groupResource(group: {
    id: string;
    name: string;
    emoji: string;
    majorEventId: string | null;
    audience: string;
    audienceCourseCodes: string[];
    interestEnabled: boolean;
    requiresImageLicenseAgreement: boolean;
    attendanceEligibility: string | null;
    shouldIssueCertificate: boolean;
    shouldIssueCertificateForNonPayingAttendees: boolean;
    shouldIssueCertificateForNonSubscribedAttendees: boolean;
    shouldIssueCertificateForEachEvent: boolean;
    shouldIssuePartialCertificate: boolean;
    updatedAt: Date;
  }): TransferResource {
    return this.resource(
      'group',
      group.id,
      {
        name: group.name,
        emoji: group.emoji,
        majorEventId: group.majorEventId,
        audience: group.audience,
        audienceCourseCodes: group.audienceCourseCodes,
        interestEnabled: group.interestEnabled,
        requiresImageLicenseAgreement: group.requiresImageLicenseAgreement,
        attendanceEligibility: group.attendanceEligibility,
        shouldIssueCertificate: group.shouldIssueCertificate,
        shouldIssueCertificateForNonPayingAttendees: group.shouldIssueCertificateForNonPayingAttendees,
        shouldIssueCertificateForNonSubscribedAttendees: group.shouldIssueCertificateForNonSubscribedAttendees,
        shouldIssueCertificateForEachEvent: group.shouldIssueCertificateForEachEvent,
        shouldIssuePartialCertificate: group.shouldIssuePartialCertificate,
      },
      group.updatedAt.toISOString(),
    );
  }

  private venueResource(venue: {
    id: string;
    tournamentId: string;
    placePresetId: string;
    parentVenueId: string | null;
    name: string;
    courtLabel: string | null;
    capacity: number | null;
    notes: string | null;
    revision: number;
    updatedAt: Date;
  }): TransferResource {
    return this.resource(
      'sports-venue',
      venue.id,
      {
        tournamentId: venue.tournamentId,
        placePresetId: venue.placePresetId,
        parentVenueId: venue.parentVenueId,
        name: venue.name,
        courtLabel: venue.courtLabel,
        capacity: venue.capacity,
        notes: venue.notes,
      },
      venue.updatedAt.toISOString(),
    );
  }

  private placeResource(place: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    locationDescription: string | null;
    updatedAt: Date;
  }): TransferResource {
    return this.resource(
      'place-preset',
      place.id,
      {
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        locationDescription: place.locationDescription,
      },
      place.updatedAt.toISOString(),
    );
  }

  private stageResource(stage: {
    id: string;
    categoryId: string;
    name: string;
    type: string;
    displayOrder: number;
    settings: Prisma.JsonValue;
    updatedAt: Date;
  }): TransferResource {
    return this.resource(
      'sports-stage',
      stage.id,
      {
        categoryId: stage.categoryId,
        name: stage.name,
        type: stage.type,
        displayOrder: stage.displayOrder,
        settings: this.toJsonValue(stage.settings),
      },
      stage.updatedAt.toISOString(),
    );
  }

  private matchResource(match: {
    id: string;
    eventId: string;
    categoryId: string;
    stageId: string | null;
    venueId: string | null;
    notes: string | null;
    livestreamProvider: string | null;
    livestreamUrl: string | null;
    roundNumber: number | null;
    bracketPosition: number | null;
    groupKey: string | null;
    revision: number;
    updatedAt: Date;
    event: { name: string; emoji: string; startDate: Date; endDate: Date; updatedAt: Date };
  }): TransferResource {
    return this.resource(
      'sports-match',
      match.id,
      {
        eventId: match.eventId,
        categoryId: match.categoryId,
        name: match.event.name,
        emoji: match.event.emoji,
        startDate: match.event.startDate.toISOString(),
        endDate: match.event.endDate.toISOString(),
        stageId: match.stageId,
        venueId: match.venueId,
        notes: match.notes,
        livestreamProvider: match.livestreamProvider,
        livestreamUrl: match.livestreamUrl,
        roundNumber: match.roundNumber,
        bracketPosition: match.bracketPosition,
        groupKey: match.groupKey,
      },
      match.updatedAt.toISOString(),
    );
  }

  private backingEventResource(event: {
    id: string;
    name: string;
    emoji: string;
    startDate: Date;
    endDate: Date;
    majorEventId: string | null;
    eventGroupId: string | null;
    updatedAt: Date;
  }): TransferResource {
    return this.resource(
      'event',
      event.id,
      {
        name: event.name,
        emoji: event.emoji,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        majorEventId: event.majorEventId,
        eventGroupId: event.eventGroupId,
      },
      event.updatedAt.toISOString(),
    );
  }

  private tournamentInput(data: PlainRecord) {
    return {
      registrationStartDate: this.nullableDate(data.registrationStartDate),
      registrationEndDate: this.nullableDate(data.registrationEndDate),
      scoringMode: (this.text(data.scoringMode) as SportsScoringMode | null) ?? undefined,
      selfSubscriptionEnabled: this.boolean(data.selfSubscriptionEnabled),
      selfSubscriptionAllowNoTeam: this.boolean(data.selfSubscriptionAllowNoTeam),
      selfSubscriptionAllowNoCategory: this.boolean(data.selfSubscriptionAllowNoCategory),
      allowPlayerMultipleTeams: this.boolean(data.allowPlayerMultipleTeams),
      shouldIssueCertificate: this.boolean(data.shouldIssueCertificate),
    };
  }

  private groupSettings(data: PlainRecord) {
    return {
      ...(data.audience !== undefined ? { audience: this.text(data.audience) as EventAudience } : {}),
      ...(data.audienceCourseCodes !== undefined ? { audienceCourseCodes: data.audienceCourseCodes as string[] } : {}),
      ...(data.interestEnabled !== undefined ? { interestEnabled: this.boolean(data.interestEnabled) } : {}),
      ...(data.requiresImageLicenseAgreement !== undefined
        ? { requiresImageLicenseAgreement: this.boolean(data.requiresImageLicenseAgreement) }
        : {}),
      ...(data.attendanceEligibility !== undefined
        ? { attendanceEligibility: this.nullableText(data.attendanceEligibility) as AttendanceEligibility | null }
        : {}),
      ...(data.shouldIssueCertificateForNonPayingAttendees !== undefined
        ? {
            shouldIssueCertificateForNonPayingAttendees: this.boolean(data.shouldIssueCertificateForNonPayingAttendees),
          }
        : {}),
      ...(data.shouldIssueCertificateForNonSubscribedAttendees !== undefined
        ? {
            shouldIssueCertificateForNonSubscribedAttendees: this.boolean(
              data.shouldIssueCertificateForNonSubscribedAttendees,
            ),
          }
        : {}),
      ...(data.shouldIssueCertificateForEachEvent !== undefined
        ? { shouldIssueCertificateForEachEvent: this.boolean(data.shouldIssueCertificateForEachEvent) }
        : {}),
      ...(data.shouldIssuePartialCertificate !== undefined
        ? { shouldIssuePartialCertificate: this.boolean(data.shouldIssuePartialCertificate) }
        : {}),
    };
  }

  private matchRevision(match: { revision: number; event: { updatedAt: Date } }): string {
    return `${match.revision}:${match.event.updatedAt.toISOString()}`;
  }

  private iso(value: Date | null | undefined): string | null | undefined {
    return value === undefined ? undefined : value === null ? null : value.toISOString();
  }

  private toJsonValue(value: Prisma.JsonValue): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.toJsonValue(item));
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, Prisma.JsonValue] => entry[1] !== undefined)
        .map(([key, item]) => [key, this.toJsonValue(item)]),
    );
  }

  private dedupeResources(resources: readonly TransferResource[]): TransferResource[] {
    const byKey = new Map<string, TransferResource>();
    for (const resource of resources) {
      byKey.set(`${resource.kind}:${resource.id}`, resource);
    }
    return [...byKey.values()];
  }

  private dedupeIssues(issues: readonly TransferIssue[]): TransferIssue[] {
    const byKey = new Map<string, TransferIssue>();
    for (const issue of issues) {
      byKey.set(`${issue.kind ?? ''}:${issue.message}`, issue);
    }
    return [...byKey.values()];
  }

  private omittedIssue(kind: TransferResourceKind): TransferIssue {
    return {
      kind,
      message: 'Parte da configuração esportiva foi omitida por restrições de acesso ou dependência.',
    };
  }
}
