import { CertificateScope } from '@cacic-eventos/shared-data-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EVENT_GROUP_SELECT,
  EVENT_SELECT,
  MAJOR_EVENT_SELECT,
} from './certificate.constants';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CertificateTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  listIssuableEvents(query?: string, skip?: number, take?: number) {
    const normalizedQuery = query?.trim();
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      majorEventId: null,
      shouldIssueCertificate: true,
      OR: [
        {
          eventGroupId: null,
        },
        {
          eventGroup: {
            deletedAt: null,
            shouldIssueCertificateForEachEvent: true,
          },
        },
      ],
    };

    if (normalizedQuery) {
      where.name = {
        contains: normalizedQuery,
        mode: 'insensitive',
      };
    }

    return this.prisma.event.findMany({
      where,
      select: EVENT_SELECT,
      orderBy: {
        startDate: 'desc',
      },
      skip,
      take,
    });
  }

  listIssuableEventGroups(query?: string, skip?: number, take?: number) {
    const normalizedQuery = query?.trim();
    const where: Prisma.EventGroupWhereInput = {
      deletedAt: null,
      shouldIssueCertificateForEachEvent: false,
      events: {
        some: {
          deletedAt: null,
          majorEventId: null,
          shouldIssueCertificate: true,
        },
      },
    };

    if (normalizedQuery) {
      where.name = {
        contains: normalizedQuery,
        mode: 'insensitive',
      };
    }

    return this.prisma.eventGroup.findMany({
      where,
      select: EVENT_GROUP_SELECT,
      orderBy: {
        name: 'asc',
      },
      skip,
      take,
    });
  }

  listIssuableMajorEvents(query?: string, skip?: number, take?: number) {
    const normalizedQuery = query?.trim();
    const where: Prisma.MajorEventWhereInput = {
      deletedAt: null,
      events: {
        some: {
          deletedAt: null,
          shouldIssueCertificate: true,
        },
      },
    };

    if (normalizedQuery) {
      where.name = {
        contains: normalizedQuery,
        mode: 'insensitive',
      };
    }

    return this.prisma.majorEvent.findMany({
      where,
      select: MAJOR_EVENT_SELECT,
      orderBy: {
        startDate: 'desc',
      },
      skip,
      take,
    });
  }

  async assertIssuableTarget(scope: CertificateScope, targetId: string) {
    if (scope === CertificateScope.EVENT) {
      const event = await this.prisma.event.findFirst({
        where: {
          id: targetId,
          deletedAt: null,
          majorEventId: null,
          shouldIssueCertificate: true,
          OR: [
            {
              eventGroupId: null,
            },
            {
              eventGroup: {
                deletedAt: null,
                shouldIssueCertificateForEachEvent: true,
              },
            },
          ],
        },
        select: EVENT_SELECT,
      });

      if (!event) {
        throw new NotFoundException(
          `Event ${targetId} cannot issue individual certificates.`,
        );
      }
      return;
    }

    if (scope === CertificateScope.EVENT_GROUP) {
      const eventGroup = await this.prisma.eventGroup.findFirst({
        where: {
          id: targetId,
          deletedAt: null,
          shouldIssueCertificateForEachEvent: false,
          events: {
            some: {
              deletedAt: null,
              majorEventId: null,
              shouldIssueCertificate: true,
            },
          },
        },
        select: EVENT_GROUP_SELECT,
      });

      if (!eventGroup) {
        throw new NotFoundException(
          `Event group ${targetId} cannot issue merged certificates.`,
        );
      }
      return;
    }

    if (scope === CertificateScope.MAJOR_EVENT) {
      const majorEvent = await this.prisma.majorEvent.findFirst({
        where: {
          id: targetId,
          deletedAt: null,
          events: {
            some: {
              deletedAt: null,
              shouldIssueCertificate: true,
            },
          },
        },
        select: MAJOR_EVENT_SELECT,
      });

      if (!majorEvent) {
        throw new NotFoundException(
          `Major event ${targetId} cannot issue certificates.`,
        );
      }
    }
  }
}
