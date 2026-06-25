import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { PublicationState } from '@cacic-fct/shared-data-types';
import { PublicationState as PrismaPublicationState } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  PUBLICATION_QUEUE,
  PUBLISH_SCHEDULED_CONTENT_JOB,
  RECONCILE_PUBLICATION_STATES_JOB,
} from './publishing.constants';
import { PublicationSearchSyncService } from './publishing-search-sync.service';
import { PublicationTransitionService } from './publishing-transition.service';
import { PublicationJobData, PublicationQueueData, TargetSync } from './publishing.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicationJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: PublicationTransitionService,
    private readonly searchSync: PublicationSearchSyncService,
    @InjectQueue(PUBLICATION_QUEUE)
    private readonly publicationQueue: Queue<PublicationQueueData>,
  ) {}

  async schedulePublicationJobs(): Promise<void> {
    await this.publicationQueue.add(
      RECONCILE_PUBLICATION_STATES_JOB,
      {},
      {
        jobId: `publication:${RECONCILE_PUBLICATION_STATES_JOB}`,
        repeat: {
          pattern: '30 3 * * *',
          tz: 'America/Sao_Paulo',
        },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
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

    const eventSync = await Promise.all(events.map((event) => this.transitions.publishEventById(event.id, null)));
    const majorSync = await Promise.all(
      majorEvents.map((majorEvent) => this.transitions.publishMajorEventById(majorEvent.id, null)),
    );
    await Promise.all([
      this.searchSync.syncSearch(this.transitions.mergeSync([...eventSync, ...majorSync])),
      this.prisma.publicContentPreview.deleteMany({
        where: { trimAfter: { lte: now } },
      }),
    ]);
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
