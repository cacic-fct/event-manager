import { Injectable, NotFoundException } from '@nestjs/common';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { Prisma, PublicationState as PrismaPublicationState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicationTargetService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveChildEventIds(
    targetType: PublicationTargetType,
    targetId: string,
    options: {
      includeTargetEvent?: boolean;
      onlyMissingPublication?: boolean;
      requireChildren?: boolean;
    } = {},
  ): Promise<string[]> {
    if (targetType === PublicationTargetType.EVENT) {
      if (!options.includeTargetEvent) {
        return [];
      }
      const event = await this.prisma.event.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true },
      });
      if (!event) {
        throw new NotFoundException(`Event ${targetId} was not found.`);
      }
      return [event.id];
    }

    await this.assertTargetExists(targetType, targetId);

    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(targetType === PublicationTargetType.MAJOR_EVENT ? { majorEventId: targetId } : { eventGroupId: targetId }),
      ...(options.onlyMissingPublication ? { publicationState: { not: PrismaPublicationState.PUBLISHED } } : {}),
    };
    const events = await this.prisma.event.findMany({
      where,
      select: { id: true },
      orderBy: { startDate: 'asc' },
    });
    if (events.length === 0) {
      if (options.requireChildren && targetType === PublicationTargetType.EVENT_GROUP) {
        throw new NotFoundException(`Event group ${targetId} has no active events.`);
      }
    }
    return events.map((event) => event.id);
  }

  private async assertTargetExists(targetType: PublicationTargetType, targetId: string): Promise<void> {
    if (targetType === PublicationTargetType.MAJOR_EVENT) {
      const majorEvent = await this.prisma.majorEvent.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true },
      });
      if (!majorEvent) {
        throw new NotFoundException(`Major event ${targetId} was not found.`);
      }
      return;
    }

    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });
    if (!eventGroup) {
      throw new NotFoundException(`Event group ${targetId} was not found.`);
    }
  }
}
