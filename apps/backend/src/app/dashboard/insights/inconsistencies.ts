import { DashboardInconsistency } from '../models';
import { DEFAULT_EMOJI, EIGHT_HOURS_MS, SUSPICIOUS_EARLIEST_DATE } from './constants';
import { InsightEvent } from './insight-event.select';

const MIN_DESCRIPTION_CHARACTERS = 48;
const MIN_DESCRIPTION_WORDS = 6;

type SubscriptionDateTarget = {
  startDate: Date;
  endDate: Date;
  subscriptionStartDate: Date | null;
  subscriptionEndDate: Date | null;
};

export function buildInconsistencies(input: {
  now: Date;
  events: InsightEvent[];
  majorEventsWithSubscriptionDates: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    subscriptionStartDate: Date | null;
    subscriptionEndDate: Date | null;
  }[];
  singleEventGroups: {
    id: string;
    name: string;
    events: { id: string }[];
  }[];
  mismatchingCertificateGroupEvents: {
    id: string;
    name: string;
    shouldIssueCertificate: boolean;
    eventGroup: {
      id: string;
      name: string;
      shouldIssueCertificate: boolean;
    } | null;
  }[];
  pastCertificateEventsWithoutAttendance: {
    id: string;
    name: string;
  }[];
  pastCertificateEventsWithoutAttendanceCollection: {
    id: string;
    name: string;
  }[];
}): DashboardInconsistency[] {
  const inconsistencies: DashboardInconsistency[] = [];
  const eventsByLecturer = new Map<string, InsightEvent[]>();
  const eventsByPlace = new Map<string, InsightEvent[]>();

  for (const group of input.singleEventGroups) {
    if (group.events.length === 1) {
      inconsistencies.push({
        type: 'EVENT_GROUP_WITH_SINGLE_EVENT',
        action: 'OPEN_EVENT_GROUP',
        targetId: group.id,
        severity: 'INFO',
        title: 'Grupo com apenas um evento',
        description: `${group.name} tem só um evento cadastrado.`,
        eventId: group.events[0].id,
      });
    }
  }

  for (const event of input.mismatchingCertificateGroupEvents) {
    if (!event.eventGroup || event.shouldIssueCertificate === event.eventGroup.shouldIssueCertificate) {
      continue;
    }

    inconsistencies.push({
      type: 'EVENT_GROUP_CERTIFICATE_SETTING_MISMATCH',
      action: 'OPEN_EVENT',
      targetId: event.id,
      severity: 'WARNING',
      title: 'Evento não segue a emissão de certificados do grupo',
      description: `${event.name} está com emissão de certificado diferente de ${event.eventGroup.name}.`,
      eventId: event.id,
    });
  }

  for (const event of input.pastCertificateEventsWithoutAttendance) {
    inconsistencies.push({
      type: 'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE',
      action: 'OPEN_ATTENDANCE',
      targetId: event.id,
      severity: 'CRITICAL',
      title: 'Evento finalizado sem presenças',
      description: `${event.name} deve emitir certificado, mas não tem presenças registradas.`,
      eventId: event.id,
    });
  }

  for (const event of input.pastCertificateEventsWithoutAttendanceCollection) {
    inconsistencies.push({
      type: 'PAST_CERTIFICATE_EVENT_WITHOUT_ATTENDANCE_COLLECTION',
      action: 'OPEN_EVENT',
      targetId: event.id,
      severity: 'CRITICAL',
      title: 'Certificado sem coleta de presença',
      description: `${event.name} terminou com emissão de certificado ativa, mas a coleta de presença está desativada.`,
      eventId: event.id,
    });
  }

  for (const majorEvent of input.majorEventsWithSubscriptionDates) {
    const dateIssue = describeSubscriptionDateIssue(majorEvent);
    if (!dateIssue) {
      continue;
    }

    inconsistencies.push({
      type: 'MAJOR_EVENT_SUBSCRIPTION_DATE_MISMATCH',
      action: 'OPEN_MAJOR_EVENT',
      targetId: majorEvent.id,
      severity: 'WARNING',
      title: 'Inscrições fora do período do grande evento',
      description: `${majorEvent.name}: ${dateIssue}`,
    });
  }

  for (const event of input.events) {
    const isPast = event.endDate < input.now;
    if (!isPast) {
      if (event.lecturers.length === 0) {
        inconsistencies.push({
          type: 'EVENT_WITHOUT_LECTURER',
          action: 'OPEN_EVENT',
          targetId: event.id,
          severity: 'WARNING',
          title: 'Evento sem palestrante cadastrado',
          description: event.name,
          eventId: event.id,
        });
      }

      if (!hasPlace(event)) {
        inconsistencies.push({
          type: 'EVENT_WITHOUT_PLACE',
          action: 'OPEN_EVENT',
          targetId: event.id,
          severity: 'WARNING',
          title: 'Evento sem local cadastrado',
          description: event.name,
          eventId: event.id,
        });
      }

      if (hasWeakDescription(event)) {
        inconsistencies.push({
          type: 'WEAK_EVENT_DESCRIPTION',
          action: 'OPEN_EVENT',
          targetId: event.id,
          severity: 'INFO',
          title: 'Evento com descrição fraca',
          description: `${event.name} precisa de uma descrição mais completa para divulgação.`,
          eventId: event.id,
        });
      }

      const dateIssue = describeSubscriptionDateIssue(event);
      if (dateIssue) {
        inconsistencies.push({
          type: 'EVENT_SUBSCRIPTION_DATE_MISMATCH',
          action: 'OPEN_EVENT',
          targetId: event.id,
          severity: 'WARNING',
          title: 'Inscrições fora do período do evento',
          description: `${event.name}: ${dateIssue}`,
          eventId: event.id,
        });
      }

      const placeKey = resolvePlaceConflictKey(event);
      if (placeKey) {
        const placeEvents = eventsByPlace.get(placeKey) ?? [];
        placeEvents.push(event);
        eventsByPlace.set(placeKey, placeEvents);
      }
    }

    if (event.endDate.getTime() - event.startDate.getTime() > EIGHT_HOURS_MS) {
      inconsistencies.push({
        type: 'SUSPICIOUS_DURATION',
        severity: 'WARNING',
        title: 'Evento com duração suspeita',
        description: `${event.name} tem mais de 8 horas de duração.`,
        eventId: event.id,
      });
    }

    if (event.startDate < SUSPICIOUS_EARLIEST_DATE) {
      inconsistencies.push({
        type: 'SUSPICIOUS_DATE',
        severity: 'CRITICAL',
        title: 'Evento com data suspeita',
        description: `${event.name} está cadastrado antes de 2010.`,
        eventId: event.id,
      });
    }

    if (event.emoji === DEFAULT_EMOJI) {
      inconsistencies.push({
        type: 'PLACEHOLDER_EMOJI',
        severity: 'INFO',
        title: 'Evento com emoji padrão',
        description: `${event.name} ainda usa o emoji placeholder.`,
        eventId: event.id,
      });
    }

    const lecturerIds = new Set(event.lecturers.map((lecturer) => lecturer.personId));
    for (const subscription of event.subscriptions) {
      if (lecturerIds.has(subscription.personId)) {
        inconsistencies.push({
          type: 'LECTURER_SELF_SUBSCRIBED',
          severity: 'WARNING',
          title: 'Palestrante inscrito no próprio evento',
          description: event.name,
          eventId: event.id,
          personId: subscription.personId,
        });
      }
    }
    for (const attendance of event.attendances) {
      if (lecturerIds.has(attendance.personId)) {
        inconsistencies.push({
          type: 'LECTURER_SELF_ATTENDED',
          severity: 'WARNING',
          title: 'Palestrante com presença no próprio evento',
          description: event.name,
          eventId: event.id,
          personId: attendance.personId,
        });
      }
    }

    for (const lecturer of event.lecturers) {
      if (isPast) {
        continue;
      }

      const lecturerEvents = eventsByLecturer.get(lecturer.personId) ?? [];
      lecturerEvents.push(event);
      eventsByLecturer.set(lecturer.personId, lecturerEvents);
    }
  }

  for (const [personId, lecturerEvents] of eventsByLecturer.entries()) {
    for (let leftIndex = 0; leftIndex < lecturerEvents.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < lecturerEvents.length; rightIndex++) {
        const left = lecturerEvents[leftIndex];
        const right = lecturerEvents[rightIndex];
        if (hasDateOverlap(left, right)) {
          inconsistencies.push({
            type: 'LECTURER_DOUBLE_BOOKED',
            action: 'OPEN_EVENT',
            targetId: left.id,
            severity: 'CRITICAL',
            title: 'O palestrante está alocado em dois eventos simultâneos.',
            description: `${left.name} e ${right.name}`,
            eventId: left.id,
            relatedEventId: right.id,
            personId,
          });
        }
      }
    }
  }

  for (const placeEvents of eventsByPlace.values()) {
    for (let leftIndex = 0; leftIndex < placeEvents.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < placeEvents.length; rightIndex++) {
        const left = placeEvents[leftIndex];
        const right = placeEvents[rightIndex];
        if (hasDateOverlap(left, right)) {
          inconsistencies.push({
            type: 'PLACE_DOUBLE_BOOKED',
            action: 'OPEN_EVENT',
            targetId: left.id,
            severity: 'CRITICAL',
            title: 'Local alocado em eventos simultâneos',
            description: `${left.locationDescription ?? 'Local sem nome'}: ${left.name} e ${right.name}`,
            eventId: left.id,
            relatedEventId: right.id,
          });
        }
      }
    }
  }

  return inconsistencies.slice(0, 30);
}

function hasPlace(event: InsightEvent): boolean {
  return Boolean(normalizeText(event.locationDescription)) || (event.latitude !== null && event.longitude !== null);
}

function hasWeakDescription(event: InsightEvent): boolean {
  const text = normalizeText(`${event.description ?? ''} ${event.shortDescription ?? ''}`);
  if (!text) {
    return true;
  }

  const wordCount = text.split(' ').filter(Boolean).length;
  return text.length < MIN_DESCRIPTION_CHARACTERS || wordCount < MIN_DESCRIPTION_WORDS;
}

function describeSubscriptionDateIssue(target: SubscriptionDateTarget): string | null {
  const { subscriptionStartDate, subscriptionEndDate } = target;
  if (!subscriptionStartDate && !subscriptionEndDate) {
    return null;
  }

  if (subscriptionStartDate && subscriptionEndDate && subscriptionStartDate > subscriptionEndDate) {
    return 'a abertura das inscrições está depois do encerramento das inscrições.';
  }

  if (subscriptionStartDate && subscriptionStartDate > target.endDate) {
    return 'as inscrições abrem depois que a atividade termina.';
  }

  if (subscriptionEndDate && subscriptionEndDate > target.endDate) {
    return 'as inscrições encerram depois que a atividade termina.';
  }

  return null;
}

function resolvePlaceConflictKey(event: InsightEvent): string | null {
  const locationDescription = normalizeText(event.locationDescription);
  if (locationDescription) {
    return `description:${locationDescription}`;
  }

  if (event.latitude !== null && event.longitude !== null) {
    return `coordinates:${event.latitude.toFixed(5)},${event.longitude.toFixed(5)}`;
  }

  return null;
}

function hasDateOverlap(left: { startDate: Date; endDate: Date }, right: { startDate: Date; endDate: Date }): boolean {
  return left.startDate < right.endDate && right.startDate < left.endDate;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}
