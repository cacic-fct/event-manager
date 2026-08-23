import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PublicationState as PrismaPublicationState } from '@prisma/client';
import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { describeBulkOperation, describeStateChange } from './publishing-labels';
import { PublicationBulkInput, PublicationBulkOperation, PublicationStateInput } from './publishing.models';
import { PublicationSearchSyncService } from './publishing-search-sync.service';
import { PublicationStateWriterService } from './publishing-state-writer.service';
import { PublicationTargetService } from './publishing-target.service';
import { PublicationTransitionOutcome, TargetSync } from './publishing.types';
import { EventSitemapService } from '../public-events/event-sitemap.service';

@Injectable()
export class PublicationTransitionService {
  private readonly logger = new Logger(PublicationTransitionService.name);

  constructor(
    private readonly searchSync: PublicationSearchSyncService,
    private readonly stateWriter: PublicationStateWriterService,
    private readonly targets: PublicationTargetService,
    private readonly sitemap: EventSitemapService = {
      refresh: async () => [],
    } as unknown as EventSitemapService,
  ) {}

  async setPublicationState(
    input: PublicationStateInput,
    user: AuthenticatedUser | undefined,
  ): Promise<PublicationTransitionOutcome> {
    if (input.state === PrismaPublicationState.SCHEDULED && !input.scheduledPublishAt) {
      throw new BadRequestException('Escolha a data e hora de publicação.');
    }

    const sync = await this.applyTargetState({
      targetType: input.targetType,
      targetId: input.targetId,
      state: input.state,
      scheduledPublishAt: input.scheduledPublishAt ?? null,
      user,
    });
    await this.finish(sync);

    return {
      result: {
        ok: true,
        message: describeStateChange(input.state, sync),
        affectedEventIds: sync.eventIds,
        affectedMajorEventIds: sync.majorEventIds,
      },
      sync,
      scheduledState: input.state,
      scheduledPublishAt: input.scheduledPublishAt ?? null,
    };
  }

  async setEventPublicationState(
    eventId: string,
    state: PublicationState,
    user: AuthenticatedUser | undefined,
    options: { isPubliclyListed?: boolean } = {},
  ): Promise<TargetSync> {
    if (state === PrismaPublicationState.SCHEDULED) {
      throw new BadRequestException('Escolha a data e hora de publicação.');
    }

    const sync = await this.stateWriter.updateEventPublicationState(eventId, state, null, user, options);
    await this.finish(sync);
    return sync;
  }

  async runBulkOperation(
    input: PublicationBulkInput,
    user: AuthenticatedUser | undefined,
  ): Promise<PublicationTransitionOutcome> {
    const sync =
      input.operation === PublicationBulkOperation.PUBLISH_MISSING_CHILDREN
        ? await this.publishMissingChildren(input, user)
        : input.operation === PublicationBulkOperation.SCHEDULE_BUNDLE
          ? await this.scheduleBundle(input, user)
          : await this.unpublishBundle(input, user);

    await this.finish(sync);

    return {
      result: {
        ok: true,
        message: describeBulkOperation(input.operation, sync),
        affectedEventIds: sync.eventIds,
        affectedMajorEventIds: sync.majorEventIds,
      },
      sync,
      scheduledState:
        input.operation === PublicationBulkOperation.SCHEDULE_BUNDLE ? PrismaPublicationState.SCHEDULED : null,
      scheduledPublishAt:
        input.operation === PublicationBulkOperation.SCHEDULE_BUNDLE ? (input.scheduledPublishAt ?? null) : null,
    };
  }

  async publishEventById(
    eventId: string,
    user: AuthenticatedUser | null,
    options: { skipSitemap?: boolean } = {},
  ): Promise<TargetSync> {
    const sync = await this.stateWriter.updateEventPublicationState(
      eventId,
      PrismaPublicationState.PUBLISHED,
      null,
      user ?? undefined,
    );
    if (!options.skipSitemap) {
      await this.refreshSitemapBestEffort();
    }
    return sync;
  }

  async publishMajorEventById(
    majorEventId: string,
    user: AuthenticatedUser | null,
    options: { skipSitemap?: boolean } = {},
  ): Promise<TargetSync> {
    const sync = await this.stateWriter.updateMajorEventPublicationState(
      majorEventId,
      PrismaPublicationState.PUBLISHED,
      null,
      user ?? undefined,
    );
    if (!options.skipSitemap) {
      await this.refreshSitemapBestEffort();
    }
    return sync;
  }

  mergeSync(syncs: TargetSync[]): TargetSync {
    return {
      eventIds: [...new Set(syncs.flatMap((sync) => sync.eventIds))],
      majorEventIds: [...new Set(syncs.flatMap((sync) => sync.majorEventIds))],
    };
  }

  private async applyTargetState(input: {
    targetType: PublicationTargetType;
    targetId: string;
    state: PublicationState;
    scheduledPublishAt: Date | null;
    user: AuthenticatedUser | undefined;
  }): Promise<TargetSync> {
    if (input.targetType === PublicationTargetType.EVENT) {
      return this.stateWriter.updateEventPublicationState(
        input.targetId,
        input.state,
        input.scheduledPublishAt,
        input.user,
      );
    }

    if (input.targetType === PublicationTargetType.MAJOR_EVENT) {
      return this.stateWriter.updateMajorEventPublicationState(
        input.targetId,
        input.state,
        input.scheduledPublishAt,
        input.user,
      );
    }

    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      requireChildren: true,
    });
    return this.stateWriter.updateTargetsPublicationState({
      eventIds,
      state: input.state,
      scheduledPublishAt: input.scheduledPublishAt,
      user: input.user,
    });
  }

  private async finish(sync: TargetSync): Promise<void> {
    const [sitemapResult, searchResult] = await Promise.allSettled([
      this.sitemap.refresh(),
      this.searchSync.syncSearch(sync),
    ]);
    if (sitemapResult.status === 'rejected') {
      this.logger.warn(`Publication committed but sitemap refresh failed: ${formatFailure(sitemapResult.reason)}`);
    }
    if (searchResult.status === 'rejected') {
      this.logger.warn(`Publication committed but search synchronization failed: ${formatFailure(searchResult.reason)}`);
    }
  }

  async refreshSitemapBestEffort(): Promise<void> {
    try {
      await this.sitemap.refresh();
    } catch (error: unknown) {
      this.logger.warn(`Publication committed but sitemap refresh failed: ${formatFailure(error)}`);
    }
  }

  private async publishMissingChildren(
    input: PublicationBulkInput,
    user: AuthenticatedUser | undefined,
  ): Promise<TargetSync> {
    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      onlyMissingPublication: true,
    });
    return this.stateWriter.updateTargetsPublicationState({
      eventIds,
      state: PrismaPublicationState.PUBLISHED,
      scheduledPublishAt: null,
      user,
    });
  }

  private async scheduleBundle(input: PublicationBulkInput, user: AuthenticatedUser | undefined): Promise<TargetSync> {
    if (!input.scheduledPublishAt) {
      throw new BadRequestException('Escolha a data e hora de publicação.');
    }

    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      includeTargetEvent: true,
    });
    return this.stateWriter.updateTargetsPublicationState({
      eventIds,
      majorEventIds: input.targetType === PublicationTargetType.MAJOR_EVENT ? [input.targetId] : [],
      state: PrismaPublicationState.SCHEDULED,
      scheduledPublishAt: input.scheduledPublishAt,
      user,
    });
  }

  private async unpublishBundle(input: PublicationBulkInput, user: AuthenticatedUser | undefined): Promise<TargetSync> {
    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      includeTargetEvent: true,
    });
    return this.stateWriter.updateTargetsPublicationState({
      eventIds,
      majorEventIds: input.targetType === PublicationTargetType.MAJOR_EVENT ? [input.targetId] : [],
      state: PrismaPublicationState.UNPUBLISHED,
      scheduledPublishAt: null,
      user,
    });
  }
}

function formatFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
