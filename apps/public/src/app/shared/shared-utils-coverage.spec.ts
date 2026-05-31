import {
  buildEventDetail,
  buildEventGroupDetail,
  buildMajorEventDetail,
  detectCsvDelimiter,
  formatCPF,
  formatCreditMinutes,
  formatCurrency,
  formatStatusLine,
  getContactLabel,
  getEventAttendanceStatusLabel,
  getEventGroupCertificateLabel,
  getMajorEventStatusLine,
  getParticipationStatusLabels,
  getSubscribedItemDateLine,
  getSubscribedItemEmoji,
  getSubscribedItemStatusLine,
  getSubscribedItemTitle,
  isOnlineAttendanceRegistrationOpen,
  isValidCPF,
  joinUnique,
  parseCsv,
  parseEventTargetType,
  sortSubscriptionsFeed,
  unformatCPF,
  type PublicEvent,
  type PublicEventGroup,
  type PublicMajorEvent,
} from '@cacic-fct/shared-utils';

describe('shared utility coverage from public app', () => {
  it('formats attendance display values and privacy-safe unique text', () => {
    expect(formatCurrency(1234)).toBe('R$ 12,34');
    expect(formatCreditMinutes(45)).toBe('45 min');
    expect(formatCreditMinutes(90)).toBe('1,5 h');
    expect(getContactLabel('WHATSAPP')).toBe('WhatsApp');
    expect(getContactLabel(null)).toBe('Contato');
    expect(getEventAttendanceStatusLabel({ eventId: 'event-1', attendedAt: '2026-05-21T09:30:00' })).toBe(
      'Presença registrada às 21/05/2026, 09:30',
    );
    expect(getEventAttendanceStatusLabel(null)).toBe('Sem presença registrada');
    expect(joinUnique([' Sala 1 ', 'Sala 1', '', ' Auditório '])).toBe('Sala 1\nAuditório');
    expect(joinUnique([' ', ''])).toBeUndefined();
  });

  it('validates and formats CPF values', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
    expect(formatCPF('123')).toBe('123');
    expect(unformatCPF('529.982.247-25')).toBe('52998224725');
  });

  it('parses CSV content with detected delimiters, quoted fields, and a BOM header', () => {
    expect(detectCsvDelimiter('name;email\nAda;ada@example.com')).toBe(';');
    expect(parseCsv('\uFEFFname,email,notes\n"Ada, Lovelace",ada@example.com,"line ""quoted"""\nAlan,,')).toEqual({
      headers: ['name', 'email', 'notes'],
      rows: [
        { name: 'Ada, Lovelace', email: 'ada@example.com', notes: 'line "quoted"' },
        { name: 'Alan', email: '', notes: '' },
      ],
    });
  });

  it('builds event, group, and major-event detail view models', () => {
    expect(parseEventTargetType('event-group')).toBe('event-group');
    expect(parseEventTargetType('other')).toBeNull();

    const event = eventFixture({ shouldCollectAttendance: true, isOnlineAttendanceAllowed: true });
    const eventDetail = buildEventDetail({
      subscription: { eventId: event.id, event, createdAt: '2026-05-20T10:00:00' },
      attendance: null,
      hasIssuedCertificate: false,
      isLecturer: false,
    });
    expect(eventDetail).toEqual(
      expect.objectContaining({
        targetType: 'event',
        targetId: 'event-1',
        isSubscribed: true,
        shouldIssueCertificate: true,
      }),
    );
    expect(eventDetail?.events[0].canRegisterAttendance).toBe(true);

    const group = eventGroupFixture({ shouldIssuePartialCertificate: true, shouldIssueCertificateForEachEvent: true });
    const groupDetail = buildEventGroupDetail({
      subscription: {
        id: 'group-subscription-1',
        eventGroupId: group.id,
        eventGroup: group,
        events: [event, eventFixture({ id: 'event-2', name: 'Day 2', startDate: '2026-05-22T09:00:00' })],
        createdAt: '2026-05-20T10:00:00',
      },
      attendances: [{ eventId: event.id, attendedAt: '2026-05-21T09:30:00' }],
    });
    expect(groupDetail?.certificateTargets).toEqual([
      { scope: 'EVENT_GROUP', targetId: 'group-1' },
      { scope: 'EVENT', targetId: 'event-1' },
      { scope: 'EVENT', targetId: 'event-2' },
    ]);

    const majorEvent = majorEventFixture();
    const majorDetail = buildMajorEventDetail({
      subscription: {
        id: 'major-subscription-1',
        majorEventId: majorEvent.id,
        majorEvent,
        subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
        selectedEvents: [event],
        notSubscribedEvents: [eventFixture({ id: 'event-3', name: 'Optional' })],
      },
      attendances: [],
    });
    expect(majorDetail).toEqual(
      expect.objectContaining({
        targetType: 'major-event',
        statusLabel: 'Comprovante em análise',
        shouldIssueCertificate: true,
      }),
    );
    expect(majorDetail?.events[0].statusLine).toBe('Sem presença registrada, Inscrito');
    expect(majorDetail?.notSubscribedEvents[0].statusLine).toBe('Sem presença registrada, Não inscrito');
  });

  it('formats subscription feed items and statuses', () => {
    const event = eventFixture();
    const group = eventGroupFixture();
    const feed = sortSubscriptionsFeed({
      majorEventItems: [
        {
          id: 'old',
          majorEventId: 'major-old',
          majorEvent: majorEventFixture({ id: 'major-old', startDate: '2026-05-20T09:00:00' }),
          participation: participationFixture(),
        },
        {
          id: 'new',
          majorEventId: 'major-new',
          majorEvent: majorEventFixture({ id: 'major-new', startDate: '2026-05-22T09:00:00' }),
          participation: participationFixture(),
        },
      ],
      eventItems: [
        {
          __typename: 'SubscribedEventGroupItem',
          id: 'group-item',
          type: 'group',
          startDate: '2026-05-22T09:00:00',
          eventGroup: group,
          events: [event],
          participation: participationFixture({ isLecturer: true }),
        },
        {
          __typename: 'SubscribedSingleEventItem',
          id: 'single-item',
          type: 'single',
          startDate: '2026-05-21T09:00:00',
          event,
          participation: participationFixture(),
        },
      ],
      attendances: [],
    });

    expect(feed.majorEventItems.map((item) => item.id)).toEqual(['new', 'old']);
    expect(getSubscribedItemEmoji(feed.eventItems[0])).toBe(group.emoji);
    expect(getSubscribedItemTitle(feed.eventItems[1])).toBe(event.name);
    expect(getSubscribedItemDateLine(feed.eventItems[0])).toContain('21/05/2026');
    expect(
      getSubscribedItemStatusLine(feed.eventItems[0], [{ eventId: event.id, attendedAt: '2026-05-21T10:00:00' }]),
    ).toContain('Presença registrada em 1 de 1 eventos');
    expect(getMajorEventStatusLine({ ...feed.majorEventItems[0], subscriptionStatus: 'CANCELED' })).toBe(
      'Inscrição cancelada, Inscrito',
    );
    expect(getParticipationStatusLabels({ isSubscribed: true, isLecturer: true, hasIssuedCertificate: true })).toEqual([
      'Inscrito',
      'Palestrante',
      'Certificado emitido',
    ]);
    expect(formatStatusLine(['Inscrito', undefined, 'Inscrito'])).toBe('Inscrito');
  });

  it('describes event-group certificate policies and online attendance windows', () => {
    expect(getEventGroupCertificateLabel(eventGroupFixture({ shouldIssueCertificate: false }))).toBe(
      'Não emite certificados',
    );
    expect(
      getEventGroupCertificateLabel(
        eventGroupFixture({ shouldIssueCertificate: true, shouldIssueCertificateForEachEvent: true }),
      ),
    ).toBe('Um certificado por evento');
    expect(isOnlineAttendanceRegistrationOpen(eventFixture({ shouldCollectAttendance: false }))).toBe(false);
    expect(
      isOnlineAttendanceRegistrationOpen(
        eventFixture({
          shouldCollectAttendance: true,
          isOnlineAttendanceAllowed: true,
          onlineAttendanceStartDate: '2026-05-21T08:00:00',
          onlineAttendanceEndDate: '2026-05-21T11:00:00',
        }),
        new Date('2026-05-21T09:00:00'),
      ),
    ).toBe(true);
  });
});

function eventFixture(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: 'event-1',
    name: 'Oficina',
    creditMinutes: 90,
    startDate: '2026-05-21T09:00:00',
    endDate: '2026-05-21T11:00:00',
    emoji: '🎓',
    type: 'MINICURSO',
    description: 'Descricao longa',
    shortDescription: 'Descricao curta',
    locationDescription: 'Sala 1',
    majorEventId: null,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    allowSubscription: true,
    slots: 20,
    slotsAvailable: 10,
    queueCount: 0,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldCollectAttendance: false,
    isOnlineAttendanceAllowed: false,
    publiclyVisible: true,
    buttonText: null,
    buttonLink: null,
    ...overrides,
  };
}

function eventGroupFixture(overrides: Partial<PublicEventGroup> = {}): PublicEventGroup {
  return {
    id: 'group-1',
    name: 'Grupo de oficinas',
    emoji: '🧪',
    shouldIssueCertificate: true,
    shouldIssueCertificateForEachEvent: false,
    shouldIssuePartialCertificate: false,
    ...overrides,
  };
}

function majorEventFixture(overrides: Partial<PublicMajorEvent> = {}): PublicMajorEvent {
  return {
    id: 'major-1',
    name: 'Semana',
    emoji: '💻',
    startDate: '2026-05-21T09:00:00',
    endDate: '2026-05-23T18:00:00',
    description: 'Evento principal',
    contactType: 'EMAIL',
    isPaymentRequired: false,
    shouldIssueCertificate: true,
    ...overrides,
  };
}

function participationFixture(overrides = {}) {
  return {
    isSubscribed: true,
    isLecturer: false,
    hasIssuedCertificate: false,
    ...overrides,
  };
}
