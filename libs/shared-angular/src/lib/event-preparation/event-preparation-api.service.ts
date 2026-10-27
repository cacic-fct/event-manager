import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { EventMaterial, EventMaterials, EventPreparation } from '@cacic-fct/shared-event-preparation';
import { firstValueFrom, map } from 'rxjs';

const MATERIAL_FIELDS = 'links { title url releaseAfterEvent } updatedAt nextReleaseAt';
const PREPARATION_FIELDS = 'lecturerInformation collectorInformation updatedAt';

@Service()
export class EventPreparationApiService {
  private readonly http = inject(HttpClient);

  getMaterials(eventId: string, editable: boolean): Promise<EventMaterials | null> {
    const name = editable ? 'editableEventMaterials' : 'currentUserEventMaterials';
    return this.request<Record<string, EventMaterials | null>>(
      `query EventMaterials($eventId: String!) { ${name}(eventId: $eventId) { ${MATERIAL_FIELDS} } }`,
      { eventId },
    ).then((result) => result[name]);
  }

  saveMaterials(eventId: string, links: EventMaterial[], expectedUpdatedAt: string | null): Promise<EventMaterials> {
    return this.request<{ updateEventMaterials: EventMaterials }>(
      `mutation UpdateEventMaterials($eventId: String!, $links: [EventMaterialInput!]!, $expectedUpdatedAt: DateTime) {
        updateEventMaterials(eventId: $eventId, links: $links, expectedUpdatedAt: $expectedUpdatedAt) { ${MATERIAL_FIELDS} }
      }`,
      { eventId, links, expectedUpdatedAt },
    ).then((result) => result.updateEventMaterials);
  }

  getPreparation(eventId: string): Promise<EventPreparation> {
    return this.request<{ eventPreparation: EventPreparation }>(
      `query EventPreparation($eventId: String!) { eventPreparation(eventId: $eventId) { ${PREPARATION_FIELDS} } }`,
      { eventId },
    ).then((result) => result.eventPreparation);
  }

  savePreparation(eventId: string, input: EventPreparation): Promise<EventPreparation> {
    return this.request<{ updateEventPreparation: EventPreparation }>(
      `mutation UpdateEventPreparation($eventId: String!, $lecturerInformation: String, $collectorInformation: String, $expectedUpdatedAt: DateTime) {
        updateEventPreparation(eventId: $eventId, lecturerInformation: $lecturerInformation, collectorInformation: $collectorInformation, expectedUpdatedAt: $expectedUpdatedAt) { ${PREPARATION_FIELDS} }
      }`,
      {
        eventId,
        lecturerInformation: input.lecturerInformation,
        collectorInformation: input.collectorInformation,
        expectedUpdatedAt: input.updatedAt,
      },
    ).then((result) => result.updateEventPreparation);
  }

  getCollectorInformation(eventId: string): Promise<string | null> {
    return this.request<{ eventCollectorInformation: string | null }>(
      'query EventCollectorInformation($eventId: String!) { eventCollectorInformation(eventId: $eventId) }',
      { eventId },
    ).then((result) => result.eventCollectorInformation);
  }

  notifyParticipants(
    eventId: string,
    audience: 'LECTURERS' | 'SUBSCRIBERS',
    message: string,
    requestId: string,
  ): Promise<boolean> {
    return this.request<{ notifyEventParticipants: boolean }>(
      `mutation NotifyEventLecturers($eventId: String!, $audience: String!, $message: String!, $requestId: String!) {
        notifyEventParticipants(eventId: $eventId, audience: $audience, message: $message, requestId: $requestId)
      }`,
      { eventId, audience, message, requestId },
    ).then((result) => result.notifyEventParticipants);
  }

  private request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    return firstValueFrom(
      this.http.post<{ data?: T; errors?: { message: string }[] }>('/api/graphql', { query, variables }).pipe(
        map((response) => {
          if (response.errors?.length) throw new Error(response.errors.map((error) => error.message).join(' '));
          if (!response.data) throw new Error('O servidor não retornou as informações. Tente novamente.');
          return response.data;
        }),
      ),
    );
  }
}
