import type { PublicEvent, PublicEventGroup, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { buildEventGroupDetail, buildMajorEventDetail, getEventGroupCertificateTargets } from './detail-view-model';

describe('detail view model', () => {
  it('builds grouped event details with sorted events, certificate targets, and attendance summary', () => {
    const group = eventGroup({
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: true,
    });
    const lateEvent = event('late', '2026-06-27T14:00:00', {
      endDate: '2026-06-27T15:00:00',
      shouldIssueCertificate: true,
    });
    const earlyEvent = event('early', '2026-06-26T09:00:00', {
      endDate: '2026-06-26T10:00:00',
      shouldIssueCertificate: true,
    });

    const detail = buildEventGroupDetail({
      subscription: {
        id: 'subscription-1',
        eventGroupId: group.id,
        eventGroup: group,
        events: [lateEvent, earlyEvent],
        createdAt: '2026-06-20T12:00:00',
      },
      attendances: [{ eventId: 'early', attendedAt: '2026-06-26T10:00:00' }],
    });

    expect(detail?.targetType).toBe('event-group');
    expect(detail?.dateLine).toBe('26/06/2026, 09:00 - 27/06/2026, 15:00');
    expect(detail?.statusLabel).toBe('Presente em 1 de 2 eventos');
    expect(detail?.events.map((item) => item.event.id)).toEqual(['early', 'late']);
    expect(detail?.certificateTargets).toEqual([
      { scope: 'EVENT', targetId: 'early' },
      { scope: 'EVENT', targetId: 'late' },
    ]);
  });

  it('returns lecturer-only details without exposing attendee-only subscription state', () => {
    const detail = buildMajorEventDetail({
      subscription: null,
      majorEvent: majorEvent({
        shouldIssueCertificate: false,
      }),
      attendances: [],
      isLecturer: true,
    });

    expect(detail?.statusLabel).toBe('Ministrante');
    expect(detail?.isSubscribed).toBe(false);
    expect(detail?.canViewOrganizerInfo).toBe(true);
    expect(detail?.certificateTargets).toEqual([]);
  });

  it('falls back to a group certificate when per-event targets are disabled', () => {
    expect(getEventGroupCertificateTargets(eventGroup({ shouldIssueCertificate: true }), [event('one')])).toEqual([
      { scope: 'EVENT_GROUP', targetId: 'group-1' },
    ]);
  });
});

function event(id: string, startDate = '2026-06-26T09:00:00', overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id,
    name: `Evento ${id}`,
    startDate,
    endDate: addOneHour(startDate),
    emoji: '📌',
    type: 'OTHER',
    shortDescription: `Resumo ${id}`,
    locationDescription: 'Auditório',
    ...overrides,
  };
}

function eventGroup(overrides: Partial<PublicEventGroup> = {}): PublicEventGroup {
  return {
    id: 'group-1',
    name: 'Grupo de eventos',
    emoji: '📁',
    ...overrides,
  };
}

function majorEvent(overrides: Partial<PublicMajorEvent> = {}): PublicMajorEvent {
  return {
    id: 'major-1',
    name: 'Grande evento',
    emoji: '🎓',
    startDate: '2026-06-26T09:00:00',
    endDate: '2026-06-27T18:00:00',
    ...overrides,
  };
}

function addOneHour(value: string): string {
  const [date, time] = value.split('T');
  const hour = Number(time.slice(0, 2)) + 1;

  return `${date}T${String(hour).padStart(2, '0')}${time.slice(2)}`;
}
