import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  PublicationState as PrismaPublicationState,
} from '@prisma/client';
import { PublicationState } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePublicationActorId } from './publishing-auth';
import { publicationSummary } from './publishing-labels';
import { PUBLICATION_EVENT_SELECT, PUBLICATION_MAJOR_EVENT_SELECT } from './publishing.selects';
import { TargetSync } from './publishing.types';

@Injectable()
export class PublicationStateWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async updateEventPublicationState(
    eventId: string,
    state: PublicationState,
    scheduledPublishAt: Date | null,
    user: AuthenticatedUser | undefined,
  ): Promise<TargetSync> {
    const now = new Date();
    const data = this.buildPublicationUpdateData(state, scheduledPublishAt, user, now);
    const event = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: PUBLICATION_EVENT_SELECT,
      });
      if (!previous) {
        throw new NotFoundException(`Event ${eventId} was not found.`);
      }
      const updated = await tx.event.update({
        where: { id: eventId },
        data,
        select: PUBLICATION_EVENT_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: previous,
          after: updated,
          scope: {
            permission: Permission.Event.Update,
            eventId: updated.id,
            majorEventId: updated.majorEventId,
            eventGroupId: updated.eventGroupId,
          },
          summary: publicationSummary(state),
          squashWindowMs: 0,
        },
        tx,
      );
      return updated;
    });

    return { eventIds: [event.id], majorEventIds: [] };
  }

  async updateTargetsPublicationState(input: {
    eventIds?: string[];
    majorEventIds?: string[];
    state: PublicationState;
    scheduledPublishAt: Date | null;
    user: AuthenticatedUser | undefined;
  }): Promise<TargetSync> {
    const now = new Date();
    const data = this.buildPublicationUpdateData(input.state, input.scheduledPublishAt, input.user, now);
    const eventIds = [...new Set(input.eventIds ?? [])];
    const majorEventIds = [...new Set(input.majorEventIds ?? [])];

    return this.prisma.$transaction(async (tx) => {
      const updatedEventIds: string[] = [];
      const updatedMajorEventIds: string[] = [];

      for (const eventId of eventIds) {
        const previous = await tx.event.findFirst({
          where: { id: eventId, deletedAt: null },
          select: PUBLICATION_EVENT_SELECT,
        });
        if (!previous) {
          throw new NotFoundException(`Event ${eventId} was not found.`);
        }
        const updated = await tx.event.update({
          where: { id: eventId },
          data,
          select: PUBLICATION_EVENT_SELECT,
        });
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.EVENT,
            entityId: updated.id,
            entityLabel: updated.name,
            operation: AuditLogOperation.UPDATE,
            actor: input.user,
            before: previous,
            after: updated,
            scope: {
              permission: Permission.Event.Update,
              eventId: updated.id,
              majorEventId: updated.majorEventId,
              eventGroupId: updated.eventGroupId,
            },
            summary: publicationSummary(input.state),
            squashWindowMs: 0,
          },
          tx,
        );
        updatedEventIds.push(updated.id);
      }

      for (const majorEventId of majorEventIds) {
        const previous = await tx.majorEvent.findFirst({
          where: { id: majorEventId, deletedAt: null },
          select: PUBLICATION_MAJOR_EVENT_SELECT,
        });
        if (!previous) {
          throw new NotFoundException(`Major event ${majorEventId} was not found.`);
        }
        const updated = await tx.majorEvent.update({
          where: { id: majorEventId },
          data,
          select: PUBLICATION_MAJOR_EVENT_SELECT,
        });
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.MAJOR_EVENT,
            entityId: updated.id,
            entityLabel: updated.name,
            operation: AuditLogOperation.UPDATE,
            actor: input.user,
            before: previous,
            after: updated,
            scope: {
              permission: Permission.MajorEvent.Update,
              majorEventId: updated.id,
            },
            summary: publicationSummary(input.state),
            squashWindowMs: 0,
          },
          tx,
        );
        updatedMajorEventIds.push(updated.id);
      }

      return { eventIds: updatedEventIds, majorEventIds: updatedMajorEventIds };
    });
  }

  async updateMajorEventPublicationState(
    majorEventId: string,
    state: PublicationState,
    scheduledPublishAt: Date | null,
    user: AuthenticatedUser | undefined,
  ): Promise<TargetSync> {
    const now = new Date();
    const data = this.buildPublicationUpdateData(state, scheduledPublishAt, user, now);
    const majorEvent = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.majorEvent.findFirst({
        where: { id: majorEventId, deletedAt: null },
        select: PUBLICATION_MAJOR_EVENT_SELECT,
      });
      if (!previous) {
        throw new NotFoundException(`Major event ${majorEventId} was not found.`);
      }
      const updated = await tx.majorEvent.update({
        where: { id: majorEventId },
        data,
        select: PUBLICATION_MAJOR_EVENT_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: previous,
          after: updated,
          scope: {
            permission: Permission.MajorEvent.Update,
            majorEventId: updated.id,
          },
          summary: publicationSummary(state),
          squashWindowMs: 0,
        },
        tx,
      );
      return updated;
    });

    return { eventIds: [], majorEventIds: [majorEvent.id] };
  }

  private buildPublicationUpdateData(
    state: PublicationState,
    scheduledPublishAt: Date | null,
    user: AuthenticatedUser | undefined,
    now: Date,
  ): Prisma.EventUpdateInput & Prisma.MajorEventUpdateInput {
    const actorId = resolvePublicationActorId(user);
    if (state === PrismaPublicationState.SCHEDULED) {
      if (!scheduledPublishAt) {
        throw new BadRequestException('Escolha a data e hora de publicação.');
      }
      if (scheduledPublishAt <= now) {
        throw new BadRequestException('A publicação agendada precisa ficar no futuro.');
      }
      return {
        publicationState: state,
        scheduledPublishAt,
        publishedAt: null,
        unpublishedAt: null,
        publicationScheduledBy: actorId,
        publicationUpdatedBy: actorId,
      };
    }

    if (state === PrismaPublicationState.PUBLISHED) {
      return {
        publicationState: state,
        scheduledPublishAt: null,
        publishedAt: now,
        unpublishedAt: null,
        publicationUpdatedBy: actorId,
      };
    }

    if (state === PrismaPublicationState.UNPUBLISHED) {
      return {
        publicationState: state,
        scheduledPublishAt: null,
        publishedAt: null,
        unpublishedAt: now,
        publicationUpdatedBy: actorId,
      };
    }

    return {
      publicationState: PrismaPublicationState.DRAFT,
      scheduledPublishAt: null,
      publishedAt: null,
      unpublishedAt: null,
      publicationUpdatedBy: actorId,
    };
  }
}
