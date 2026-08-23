import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PublicationState } from '@cacic-fct/shared-data-types';
import { PublicationState as PrismaPublicationState } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  CLEANUP_STALE_EVENT_DRAFTS_JOB,
  PUBLICATION_QUEUE,
  PUBLISH_SCHEDULED_CONTENT_JOB,
  RECONCILE_PUBLICATION_STATES_JOB,
} from './publishing.constants';
import { PublicationSearchSyncService } from './publishing-search-sync.service';
import { PublicationTransitionService } from './publishing-transition.service';
import { PublicationJobData, PublicationQueueData, TargetSync } from './publishing.types';
import { PrismaService } from '../prisma/prisma.service';
import { EventDraftsService } from '../events/event-drafts.service';
import { buildBullMqJobId } from '../queues/bullmq-job-id';

const RECONCILE_PAGE_SIZE = 100;
const RECONCILE_CONCURRENCY = 8;

@Injectable()
export class PublicationJobsService {
  private readonly logger = new Logger(PublicationJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: PublicationTransitionService,
    private readonly searchSync: PublicationSearchSyncService,
    private readonly eventDrafts: EventDraftsService,
    @InjectQueue(PUBLICATION_QUEUE)
    private readonly publicationQueue: Queue<PublicationQueueData>,
  ) {}

  async schedulePublicationJobs(): Promise<void> {
    await Promise.all([
      this.publicationQueue.upsertJobScheduler(
        buildBullMqJobId('publication', RECONCILE_PUBLICATION_STATES_JOB),
        {
          pattern: '*/5 * * * *',
          tz: 'America/Sao_Paulo',
        },
        {
          name: RECONCILE_PUBLICATION_STATES_JOB,
          data: {},
          opts: {
            removeOnComplete: true,
            removeOnFail: 50,
          },
        },
      ),
      this.publicationQueue.upsertJobScheduler(
        buildBullMqJobId('publication', CLEANUP_STALE_EVENT_DRAFTS_JOB),
        {
          pattern: '17 3 * * *',
          tz: 'America/Sao_Paulo',
        },
        {
          name: CLEANUP_STALE_EVENT_DRAFTS_JOB,
          data: {},
          opts: {
            removeOnComplete: true,
            removeOnFail: 50,
          },
        },
      ),
    ]);
    await this.enqueuePendingScheduledContent();
  }

  async enqueueScheduledJobs(
    state: PublicationState | null,
    scheduledPublishAt: Date | null,
    sync: TargetSync,
  ): Promise<void> {
    if (state !== PrismaPublicationState.SCHEDULED || !scheduledPublishAt) {
      return;
    }
    await Promise.all([
      ...sync.eventIds.map((eventId) => this.enqueueScheduledTarget('EVENT', eventId, scheduledPublishAt)),
      ...sync.majorEventIds.map((majorEventId) =>
        this.enqueueScheduledTarget('MAJOR_EVENT', majorEventId, scheduledPublishAt),
      ),
    ]);
  }

  async processScheduledPublication(data: PublicationJobData): Promise<void> {
    const now = new Date();
    if (data.targetType === 'EVENT') {
      const event = await this.prisma.event.findFirst({
        where: {
          id: data.targetId,
          deletedAt: null,
          publicationState: PrismaPublicationState.SCHEDULED,
          scheduledPublishAt: { lte: now },
        },
        select: { id: true },
      });
      if (!event) {
        return;
      }
      const sync = await this.transitions.publishEventById(event.id, null);
      await this.searchSync.syncSearch(sync);
      return;
    }

    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: data.targetId,
        deletedAt: null,
        publicationState: PrismaPublicationState.SCHEDULED,
        scheduledPublishAt: { lte: now },
      },
      select: { id: true },
    });
    if (!majorEvent) {
      return;
    }
    const sync = await this.transitions.publishMajorEventById(majorEvent.id, null);
    await this.searchSync.syncSearch(sync);
  }

  async reconcileScheduledPublications(): Promise<void> {
    const allSyncs: TargetSync[] = [];
    const attemptedEventIds = new Set<string>();
    const attemptedMajorEventIds = new Set<string>();
    let processedPage = 0;
    while (true) {
      const now = new Date();
      const [events, majorEvents] = await Promise.all([
        this.prisma.event.findMany({
          where: {
            deletedAt: null,
            publicationState: PrismaPublicationState.SCHEDULED,
            scheduledPublishAt: { lte: now },
            ...(attemptedEventIds.size > 0 ? { id: { notIn: [...attemptedEventIds] } } : {}),
          },
          select: { id: true },
          take: RECONCILE_PAGE_SIZE,
        }),
        this.prisma.majorEvent.findMany({
          where: {
            deletedAt: null,
            publicationState: PrismaPublicationState.SCHEDULED,
            scheduledPublishAt: { lte: now },
            ...(attemptedMajorEventIds.size > 0 ? { id: { notIn: [...attemptedMajorEventIds] } } : {}),
          },
          select: { id: true },
          take: RECONCILE_PAGE_SIZE,
        }),
      ]);
      if (events.length === 0 && majorEvents.length === 0) {
        break;
      }

      processedPage += 1;
      events.forEach((event) => attemptedEventIds.add(event.id));
      majorEvents.forEach((majorEvent) => attemptedMajorEventIds.add(majorEvent.id));
      const eventResults = await mapWithConcurrency(events, RECONCILE_CONCURRENCY, (event) =>
        this.transitions.publishEventById(event.id, null, { skipSitemap: true }),
      );
      const majorResults = await mapWithConcurrency(majorEvents, RECONCILE_CONCURRENCY, (majorEvent) =>
        this.transitions.publishMajorEventById(majorEvent.id, null, { skipSitemap: true }),
      );
      this.reportPublicationFailures('EVENT', events, eventResults);
      this.reportPublicationFailures('MAJOR_EVENT', majorEvents, majorResults);
      allSyncs.push(
        ...eventResults
          .filter((result): result is PromiseFulfilledResult<TargetSync> => result.status === 'fulfilled')
          .map((result) => result.value),
        ...majorResults
          .filter((result): result is PromiseFulfilledResult<TargetSync> => result.status === 'fulfilled')
          .map((result) => result.value),
      );
    }

    if (processedPage > 0) {
      await this.transitions.refreshSitemapBestEffort();
      try {
        await this.searchSync.syncSearch(this.transitions.mergeSync(allSyncs));
      } catch (error: unknown) {
        this.logger.warn(`Publication reconciliation search sync failed: ${formatFailure(error)}`);
      }
    }
    await this.prisma.publicationPreview.deleteMany({
      where: { trimAfter: { lte: new Date() } },
    });
  }

  async cleanupStaleEventDrafts(): Promise<void> {
    const deletedCount = await this.eventDrafts.cleanupStaleDrafts();
    if (deletedCount > 0) {
      this.logger.log(`Deleted ${deletedCount} stale event draft(s).`);
    }
  }

  private reportPublicationFailures(
    targetType: PublicationJobData['targetType'],
    targets: { id: string }[],
    results: PromiseSettledResult<TargetSync>[],
  ): void {
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        return;
      }

      this.logger.error(
        `Failed to publish scheduled ${targetType} ${targets[index]?.id ?? 'unknown'}.`,
        result.reason instanceof Error ? result.reason.stack : String(result.reason),
      );
    });
  }

  private async enqueueScheduledTarget(
    targetType: PublicationJobData['targetType'],
    targetId: string,
    scheduledPublishAt: Date,
  ): Promise<void> {
    await this.publicationQueue.add(
      PUBLISH_SCHEDULED_CONTENT_JOB,
      { targetType, targetId },
      {
        jobId: this.scheduledPublicationJobId(targetType, targetId, scheduledPublishAt),
        delay: Math.max(scheduledPublishAt.getTime() - Date.now(), 0),
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  private async enqueuePendingScheduledContent(): Promise<void> {
    const [events, majorEvents] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          deletedAt: null,
          publicationState: PrismaPublicationState.SCHEDULED,
          scheduledPublishAt: { not: null },
        },
        select: { id: true, scheduledPublishAt: true },
      }),
      this.prisma.majorEvent.findMany({
        where: {
          deletedAt: null,
          publicationState: PrismaPublicationState.SCHEDULED,
          scheduledPublishAt: { not: null },
        },
        select: { id: true, scheduledPublishAt: true },
      }),
    ]);
    await Promise.all([
      ...events.map((event) => this.enqueueScheduledTarget('EVENT', event.id, event.scheduledPublishAt as Date)),
      ...majorEvents.map((majorEvent) =>
        this.enqueueScheduledTarget('MAJOR_EVENT', majorEvent.id, majorEvent.scheduledPublishAt as Date),
      ),
    ]);
  }

  private scheduledPublicationJobId(
    targetType: PublicationJobData['targetType'],
    targetId: string,
    scheduledPublishAt: Date,
  ): string {
    return buildBullMqJobId('publication', targetType, targetId, 'publish', scheduledPublishAt.getTime());
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) {
        return;
      }
      try {
        results[index] = { status: 'fulfilled', value: await operation(values[index]) };
      } catch (reason: unknown) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function formatFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
