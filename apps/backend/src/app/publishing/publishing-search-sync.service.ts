import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { PUBLICATION_EVENT_SELECT } from './publishing.selects';
import { TargetSync } from './publishing.types';

@Injectable()
export class PublicationSearchSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  async syncSearch(sync: TargetSync): Promise<void> {
    const eventIds = [...new Set(sync.eventIds)];
    const majorEventIds = [...new Set(sync.majorEventIds)];
    const [events, majorEvents] = await Promise.all([
      eventIds.length > 0
        ? this.prisma.event.findMany({
            where: { id: { in: eventIds }, deletedAt: null },
            select: PUBLICATION_EVENT_SELECT,
          })
        : Promise.resolve([]),
      majorEventIds.length > 0
        ? this.prisma.majorEvent.findMany({
            where: { id: { in: majorEventIds }, deletedAt: null },
            select: {
              id: true,
              name: true,
              description: true,
              startDate: true,
              endDate: true,
              publicationState: true,
            },
          })
        : Promise.resolve([]),
    ]);

    await Promise.all([
      ...events.map((event) =>
        this.typesenseSearch.upsertEvent({
          id: event.id,
          name: event.name,
          emoji: event.emoji,
          type: event.type,
          description: event.description,
          shortDescription: event.shortDescription,
          locationDescription: event.locationDescription,
          majorEventId: event.majorEventId,
          eventGroupId: event.eventGroupId,
          shouldIssueCertificate: event.shouldIssueCertificate,
          publiclyVisible: event.publiclyVisible,
          publicationState: event.publicationState,
          startDate: event.startDate,
          endDate: event.endDate,
        }),
      ),
      ...majorEvents.map((majorEvent) =>
        this.typesenseSearch.upsertMajorEvent({
          id: majorEvent.id,
          name: majorEvent.name,
          description: majorEvent.description,
          startDate: majorEvent.startDate,
          endDate: majorEvent.endDate,
          publicationState: majorEvent.publicationState,
        }),
      ),
    ]);
  }
}
