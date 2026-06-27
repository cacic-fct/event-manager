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
      this.publicationQueue.add(
        RECONCILE_PUBLICATION_STATES_JOB,
        {},
        {
          jobId: `publication:${RECONCILE_PUBLICATION_STATES_JOB}`,
          repeat: {
            pattern: '*/5 * * * *',
            tz: 'America/Sao_Paulo',
          },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      ),
      this.publicationQueue.add(
        CLEANUP_STALE_EVENT_DRAFTS_JOB,
        {},
        {
          jobId: `publication:${CLEANUP_STALE_EVENT_DRAFTS_JOB}`,
          repeat: {
            pattern: '17 3 * * *',
            tz: 'America/Sao_Paulo',
          },
          removeOnComplete: true,
          removeOnFail: 50,
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
      ...sync.majorEventIds.map((majorEventId) => this.enqueueScheduledTarget('MAJOR_EVENT', majorEventId, scheduledPublishAt)),
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
    const now = new Date();
    const [events, majorEvents] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          deletedAt: null,
          publicationState: PrismaPublicationState.SCHEDULED,
          scheduledPublishAt: { lte: now },
        },
        select: { id: true },
      }),
      this.prisma.majorEvent.findMany({
        where: {
          deletedAt: null,
          publicationState: PrismaPublicationState.SCHEDULED,
          scheduledPublishAt: { lte: now },
        },
        select: { id: true },
      }),
    ]);

    const eventResults = await Promise.allSettled(
      events.map((event) => this.transitions.publishEventById(event.id, null)),
    );
    const majorResults = await Promise.allSettled(
      majorEvents.map((majorEvent) => this.transitions.publishMajorEventById(majorEvent.id, null)),
    );
    this.reportPublicationFailures('EVENT', events, eventResults);
    this.reportPublicationFailures('MAJOR_EVENT', majorEvents, majorResults);
    const eventSync = eventResults
      .filter((result): result is PromiseFulfilledResult<TargetSync> => result.status === 'fulfilled')
      .map((result) => result.value);
    const majorSync = majorResults
      .filter((result): result is PromiseFulfilledResult<TargetSync> => result.status === 'fulfilled')
      .map((result) => result.value);

    await Promise.all([
      this.searchSync.syncSearch(this.transitions.mergeSync([...eventSync, ...majorSync])),
      this.prisma.publicContentPreview.deleteMany({
        where: { trimAfter: { lte: now } },
      }),
    ]);
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
    return `publication:${targetType}:${targetId}:publish:${scheduledPublishAt.getTime()}`;
  }
}
