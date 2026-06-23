import { CertificateScope } from '@cacic-fct/shared-data-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessibleEventGrantTargets } from '../authorization/authorization-policy.service';
import { EVENT_GROUP_SELECT, EVENT_SELECT, MAJOR_EVENT_SELECT } from './certificate.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

@Injectable()
export class CertificateTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService = {
      isEnabled: () => false,
      searchEvents: async () => ({ available: false, ids: [] }),
      searchEventGroups: async () => ({ available: false, ids: [] }),
      searchMajorEvents: async () => ({ available: false, ids: [] }),
    } as unknown as TypesenseSearchService,
  ) {}

  async listIssuableEvents(
    query?: string,
    skip?: number,
    take?: number,
    accessibleTargets?: AccessibleEventGrantTargets | null,
  ) {
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
            shouldIssueCertificate: true,
            shouldIssueCertificateForEachEvent: true,
          },
        },
      ],
    };
    if (!this.applyAccessibleEventTargets(where, accessibleTargets)) {
      return [];
    }

    if (normalizedQuery) {
      const canUseTypesense = this.typesenseSearch.isEnabled() && !accessibleTargets;
      if (canUseTypesense) {
        const searchResult = await this.typesenseSearch.searchEvents(normalizedQuery, {
          filterBy: 'isIssuableCertificateEvent:=true',
          limit: take ?? 50,
          offset: skip ?? 0,
        });
        if (searchResult.available) {
          if (searchResult.ids.length === 0) {
            return [];
          }
          where.id = { in: searchResult.ids };

          const events = await this.prisma.event.findMany({
            where,
            select: EVENT_SELECT,
            orderBy: {
              startDate: 'desc',
            },
            skip: 0,
            take: searchResult.ids.length,
          });

          return this.sortByTypesenseRank(events, searchResult.ids);
        }
      }

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

  async listIssuableEventGroups(
    query?: string,
    skip?: number,
    take?: number,
    accessibleTargets?: AccessibleEventGrantTargets | null,
  ) {
    const normalizedQuery = query?.trim();
    const where: Prisma.EventGroupWhereInput = {
      deletedAt: null,
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: false,
      events: {
        some: {
          deletedAt: null,
          majorEventId: null,
          shouldIssueCertificate: true,
        },
      },
    };
    if (accessibleTargets) {
      if (accessibleTargets.eventGroupIds.size === 0) {
        return [];
      }
      where.id = {
        in: [...accessibleTargets.eventGroupIds],
      };
    }

    if (normalizedQuery) {
      const canUseTypesense = this.typesenseSearch.isEnabled() && !accessibleTargets;
      if (canUseTypesense) {
        const searchResult = await this.typesenseSearch.searchEventGroups(normalizedQuery, (skip ?? 0) + (take ?? 50));
        if (searchResult.available) {
          if (searchResult.ids.length === 0) {
            return [];
          }
          where.id = { in: searchResult.ids };

          const eventGroups = await this.prisma.eventGroup.findMany({
            where,
            select: EVENT_GROUP_SELECT,
            orderBy: {
              name: 'asc',
            },
            skip: 0,
            take: searchResult.ids.length,
          });

          return this.sortByTypesenseRank(eventGroups, searchResult.ids).slice(skip ?? 0, (skip ?? 0) + (take ?? 50));
        }
      }

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

  async listIssuableMajorEvents(
    query?: string,
    skip?: number,
    take?: number,
    accessibleTargets?: AccessibleEventGrantTargets | null,
  ) {
    const normalizedQuery = query?.trim();
    const where: Prisma.MajorEventWhereInput = {
      deletedAt: null,
      events: {
        some: {
          deletedAt: null,
          shouldIssueCertificate: true,
          OR: [
            {
              eventGroupId: null,
            },
            {
              eventGroup: {
                deletedAt: null,
                shouldIssueCertificate: true,
              },
            },
          ],
        },
      },
    };
    if (accessibleTargets) {
      if (accessibleTargets.majorEventIds.size === 0) {
        return [];
      }
      where.id = {
        in: [...accessibleTargets.majorEventIds],
      };
    }

    if (normalizedQuery) {
      const canUseTypesense = this.typesenseSearch.isEnabled() && !accessibleTargets;
      if (canUseTypesense) {
        const searchResult = await this.typesenseSearch.searchMajorEvents(normalizedQuery, (skip ?? 0) + (take ?? 50));
        if (searchResult.available) {
          if (searchResult.ids.length === 0) {
            return [];
          }
          where.id = { in: searchResult.ids };

          const majorEvents = await this.prisma.majorEvent.findMany({
            where,
            select: MAJOR_EVENT_SELECT,
            orderBy: {
              startDate: 'desc',
            },
            skip: 0,
            take: searchResult.ids.length,
          });

          return this.sortByTypesenseRank(majorEvents, searchResult.ids).slice(skip ?? 0, (skip ?? 0) + (take ?? 50));
        }
      }

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
                shouldIssueCertificate: true,
                shouldIssueCertificateForEachEvent: true,
              },
            },
          ],
        },
        select: EVENT_SELECT,
      });

      if (!event) {
        throw new NotFoundException(`Event ${targetId} cannot issue individual certificates.`);
      }
      return;
    }

    if (scope === CertificateScope.EVENT_GROUP) {
      const eventGroup = await this.prisma.eventGroup.findFirst({
        where: {
          id: targetId,
          deletedAt: null,
          shouldIssueCertificate: true,
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
        throw new NotFoundException(`Event group ${targetId} cannot issue merged certificates.`);
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
              OR: [
                {
                  eventGroupId: null,
                },
                {
                  eventGroup: {
                    deletedAt: null,
                    shouldIssueCertificate: true,
                  },
                },
              ],
            },
          },
        },
        select: MAJOR_EVENT_SELECT,
      });

      if (!majorEvent) {
        throw new NotFoundException(`Major event ${targetId} cannot issue certificates.`);
      }
    }
  }

  private applyAccessibleEventTargets(
    where: Prisma.EventWhereInput,
    accessibleTargets: AccessibleEventGrantTargets | null | undefined,
  ): boolean {
    if (!accessibleTargets) {
      return true;
    }

    const targetWhere: Prisma.EventWhereInput[] = [];
    if (accessibleTargets.eventIds.size > 0) {
      targetWhere.push({ id: { in: [...accessibleTargets.eventIds] } });
    }
    if (accessibleTargets.majorEventIds.size > 0) {
      targetWhere.push({ majorEventId: { in: [...accessibleTargets.majorEventIds] } });
    }
    if (accessibleTargets.eventGroupIds.size > 0) {
      targetWhere.push({ eventGroupId: { in: [...accessibleTargets.eventGroupIds] } });
    }

    if (targetWhere.length === 0) {
      return false;
    }

    where.AND = [this.normalizeEventWhereAnd(where.AND), { OR: targetWhere }].flat();
    return true;
  }

  private sortByTypesenseRank<T extends { id: string }>(items: T[], ids: string[]): T[] {
    const rank = new Map(ids.map((id, index) => [id, index]));
    return [...items].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  private normalizeEventWhereAnd(
    andWhere: Prisma.EventWhereInput | Prisma.EventWhereInput[] | undefined,
  ): Prisma.EventWhereInput[] {
    if (!andWhere) {
      return [];
    }

    return Array.isArray(andWhere) ? andWhere : [andWhere];
  }
}
