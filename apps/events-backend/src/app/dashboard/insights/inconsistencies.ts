import { DashboardInconsistency } from '../models';
import { DEFAULT_EMOJI, EIGHT_HOURS_MS, SUSPICIOUS_EARLIEST_DATE } from './constants';
import { InsightEvent } from './insight-event.select';

export function buildInconsistencies(input: {
  events: InsightEvent[];
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
}): DashboardInconsistency[] {
  const inconsistencies: DashboardInconsistency[] = [];
  const eventsByLecturer = new Map<string, InsightEvent[]>();

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

  for (const event of input.events) {
    if (event.lecturers.length === 0) {
      inconsistencies.push({
        type: 'EVENT_WITHOUT_LECTURER',
        severity: 'WARNING',
        title: 'Evento sem palestrante cadastrado',
        description: event.name,
        eventId: event.id,
      });
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
        if (left.startDate < right.endDate && right.startDate < left.endDate) {
          inconsistencies.push({
            type: 'LECTURER_DOUBLE_BOOKED',
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

  return inconsistencies.slice(0, 30);
}
