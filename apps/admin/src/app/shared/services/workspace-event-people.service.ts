import { Injectable, inject } from '@angular/core';
import type { EventAttendanceCollector, EventLecturer, Person } from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';

export interface WorkspaceEventPersonLink {
  personId: string;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventPeopleService {
  private readonly eventsApi = inject(EventApiService);
  private readonly peopleApi = inject(PeopleApiService);

  async listLecturers(eventId: string): Promise<WorkspaceEventPersonLink[]> {
    return (await firstValueFrom(this.eventsApi.listEventLecturers(eventId))).map((lecturer) =>
      this.toPersonLink(lecturer),
    );
  }

  async addLecturer(eventId: string, personId: string): Promise<void> {
    await firstValueFrom(
      this.eventsApi.createEventLecturer({
        eventId,
        personId,
      }),
    );
  }

  async removeLecturer(eventId: string, personId: string): Promise<void> {
    await firstValueFrom(this.eventsApi.deleteEventLecturer(eventId, personId));
  }

  async listAttendanceCollectors(eventId: string): Promise<WorkspaceEventPersonLink[]> {
    return (await firstValueFrom(this.eventsApi.listEventAttendanceCollectors(eventId))).map((collector) =>
      this.toPersonLink(collector),
    );
  }

  async addAttendanceCollector(eventId: string, personId: string): Promise<void> {
    await firstValueFrom(
      this.eventsApi.createEventAttendanceCollector({
        eventId,
        personId,
      }),
    );
  }

  async removeAttendanceCollector(eventId: string, personId: string): Promise<void> {
    await firstValueFrom(this.eventsApi.deleteEventAttendanceCollector(eventId, personId));
  }

  async searchCandidates(query: string, take: number): Promise<Person[]> {
    const searches = [firstValueFrom(this.peopleApi.listPeopleSummaries({ query, take }))];
    const identityDocumentDigits = query.replace(/\D/g, '');

    if (query.includes('@')) {
      searches.unshift(firstValueFrom(this.peopleApi.listPeopleSummaries({ email: query, take })));
    }

    if (identityDocumentDigits.length >= 8) {
      searches.unshift(firstValueFrom(this.peopleApi.listPeopleSummaries({ identityDocument: query, take })));
      if (identityDocumentDigits !== query) {
        searches.unshift(
          firstValueFrom(this.peopleApi.listPeopleSummaries({ identityDocument: identityDocumentDigits, take })),
        );
      }
    }

    const peopleById = new Map<string, Person>();
    for (const person of (await Promise.all(searches)).flat()) {
      peopleById.set(person.id, person);
    }

    return [...peopleById.values()].slice(0, take);
  }

  async listGroupLecturerSuggestions(eventGroupId: string, currentEventId: string): Promise<Person[]> {
    const groupEvents = await firstValueFrom(this.eventsApi.listEvents({ eventGroupId, take: 100 }));
    const sourceEventIds = groupEvents.map((eventItem) => eventItem.id).filter((eventId) => eventId !== currentEventId);

    if (sourceEventIds.length === 0) {
      return [];
    }

    const lecturerGroups = await Promise.all(
      sourceEventIds.map((eventId) => firstValueFrom(this.eventsApi.listEventLecturers(eventId))),
    );
    const suggestions = new Map<string, Person>();
    for (const lecturer of lecturerGroups.flat()) {
      if (lecturer.person) {
        suggestions.set(lecturer.person.id, lecturer.person);
      }
    }

    return [...suggestions.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  private toPersonLink(record: EventLecturer | EventAttendanceCollector): WorkspaceEventPersonLink {
    return {
      personId: record.personId,
      name: record.person?.name ?? record.personId,
    };
  }
}
