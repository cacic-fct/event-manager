import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  PublicationState as PrismaPublicationState,
  PublicContentPreviewTargetType,
} from '@prisma/client';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  PUBLIC_EVENT_GROUP_SELECT,
  PUBLIC_EVENT_SELECT,
  PUBLIC_MAJOR_EVENT_SELECT,
  mapPublicMajorEvent,
} from '../public-events/models';
import {
  PublicContentPreviewInput,
  PublicContentPreviewPayload,
} from './publishing.models';
import { publicUrl } from './publishing-preview-url';

@Injectable()
export class PublicationPreviewContentService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveDirectPublishedUrl(input: PublicContentPreviewInput): Promise<string | null> {
    if (input.targetType === PublicationTargetType.EVENT) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.targetId, deletedAt: null },
        select: {
          id: true,
          publiclyVisible: true,
          publicationState: true,
          publishedAt: true,
          updatedAt: true,
          majorEvent: {
            select: {
              publicationState: true,
              deletedAt: true,
              publishedAt: true,
              updatedAt: true,
            },
          },
        },
      });
      if (
        event?.publicationState === PrismaPublicationState.PUBLISHED &&
        event.publiclyVisible &&
        (!event.majorEvent ||
          (!event.majorEvent.deletedAt &&
            event.majorEvent.publicationState === PrismaPublicationState.PUBLISHED &&
            event.majorEvent.publishedAt &&
            event.majorEvent.updatedAt <= event.majorEvent.publishedAt)) &&
        event.publishedAt &&
        event.updatedAt <= event.publishedAt
      ) {
        return publicUrl(`/event/${event.id}`);
      }
    }

    if (input.targetType === PublicationTargetType.MAJOR_EVENT) {
      const majorEvent = await this.prisma.majorEvent.findFirst({
        where: { id: input.targetId, deletedAt: null },
        select: {
          publicationState: true,
          publishedAt: true,
          updatedAt: true,
        },
      });
      if (
        majorEvent?.publicationState === PrismaPublicationState.PUBLISHED &&
        majorEvent.publishedAt &&
        majorEvent.updatedAt <= majorEvent.publishedAt
      ) {
        return publicUrl('/major-event');
      }
    }

    return null;
  }

  async resolvePreviewTarget(
    targetType: PublicationTargetType,
    targetId: string,
  ): Promise<{ label: string; auditType: AuditLogEntityType }> {
    if (targetType === PublicationTargetType.EVENT) {
      const event = await this.prisma.event.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { name: true },
      });
      if (!event) {
        throw new NotFoundException(`Event ${targetId} was not found.`);
      }
      return { label: event.name, auditType: AuditLogEntityType.EVENT };
    }
    if (targetType === PublicationTargetType.MAJOR_EVENT) {
      const majorEvent = await this.prisma.majorEvent.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { name: true },
      });
      if (!majorEvent) {
        throw new NotFoundException(`Major event ${targetId} was not found.`);
      }
      return { label: majorEvent.name, auditType: AuditLogEntityType.MAJOR_EVENT };
    }
    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { name: true },
    });
    if (!eventGroup) {
      throw new NotFoundException(`Event group ${targetId} was not found.`);
    }
    return { label: eventGroup.name, auditType: AuditLogEntityType.EVENT_GROUP };
  }

  async loadPreviewPayload(preview: {
    targetType: PublicContentPreviewTargetType;
    targetId: string;
    previewAt: Date;
    expiresAt: Date;
  }): Promise<PublicContentPreviewPayload> {
    if (preview.targetType === PublicContentPreviewTargetType.EVENT) {
      const event = await this.prisma.event.findFirst({
        where: { id: preview.targetId, deletedAt: null },
        select: PUBLIC_EVENT_SELECT,
      });
      if (!event) {
        throw new NotFoundException(`Event ${preview.targetId} was not found.`);
      }
      return {
        targetType: preview.targetType,
        targetId: preview.targetId,
        previewAt: preview.previewAt,
        expiresAt: preview.expiresAt,
        event,
        eventGroup: event.eventGroup,
        majorEvent: event.majorEvent ? mapPublicMajorEvent(event.majorEvent) : null,
        events: [event],
      };
    }

    if (preview.targetType === PublicContentPreviewTargetType.MAJOR_EVENT) {
      const majorEvent = await this.prisma.majorEvent.findFirst({
        where: { id: preview.targetId, deletedAt: null },
        select: PUBLIC_MAJOR_EVENT_SELECT,
      });
      if (!majorEvent) {
        throw new NotFoundException(`Major event ${preview.targetId} was not found.`);
      }
      const events = await this.prisma.event.findMany({
        where: { majorEventId: preview.targetId, deletedAt: null },
        select: PUBLIC_EVENT_SELECT,
        orderBy: { startDate: 'asc' },
      });
      return {
        targetType: preview.targetType,
        targetId: preview.targetId,
        previewAt: preview.previewAt,
        expiresAt: preview.expiresAt,
        event: null,
        eventGroup: null,
        majorEvent: mapPublicMajorEvent(majorEvent),
        events,
      };
    }

    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: { id: preview.targetId, deletedAt: null },
      select: PUBLIC_EVENT_GROUP_SELECT,
    });
    if (!eventGroup) {
      throw new NotFoundException(`Event group ${preview.targetId} was not found.`);
    }
    const events = await this.prisma.event.findMany({
      where: { eventGroupId: preview.targetId, deletedAt: null },
      select: PUBLIC_EVENT_SELECT,
      orderBy: { startDate: 'asc' },
    });
    return {
      targetType: preview.targetType,
      targetId: preview.targetId,
      previewAt: preview.previewAt,
      expiresAt: preview.expiresAt,
      event: null,
      eventGroup,
      majorEvent: events[0]?.majorEvent ? mapPublicMajorEvent(events[0].majorEvent) : null,
      events,
    };
  }
}
