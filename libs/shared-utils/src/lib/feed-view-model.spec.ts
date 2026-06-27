import type { PublicEvent, PublicEventGroup, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import {
  getMajorEventStatusLine,
  getSubscribedItemDateLine,
  getSubscribedItemEmoji,
  getSubscribedItemStatusLine,
  getSubscribedItemTitle,
  sortSubscriptionsFeed,
} from './feed-view-model';
import type { CurrentUserMajorEventFeedItem, SubscribedEventGroupItem, SubscribedSingleEventItem } from './attendance-models';

describe('feed view model', () => {
  it('sorts major event and standalone feed items newest first without mutating the source feed', () => {
    const feed = {
      majorEventItems: [
        majorEventFeedItem('older-major', '2026-06-01T09:00:00'),
        majorEventFeedItem('newer-major', '2026-06-20T09:00:00'),
      ],
      eventItems: [
        singleEventItem('older-event', '2026-06-05T09:00:00'),
        singleEventItem('newer-event', '2026-06-25T09:00:00'),
      ],
      attendances: [],
    };

    const sorted = sortSubscriptionsFeed(feed);

    expect(sorted.majorEventItems.map((item) => item.id)).toEqual(['newer-major', 'older-major']);
    expect(sorted.eventItems.map((item) => item.id)).toEqual(['newer-event', 'older-event']);
    expect(feed.majorEventItems.map((item) => item.id)).toEqual(['older-major', 'newer-major']);
  });

  it('maps subscribed single-event metadata and attendance status', () => {
    const item = singleEventItem('event-1', '2026-06-26T09:00:00');

    expect(getSubscribedItemEmoji(item)).toBe('📌');
    expect(getSubscribedItemTitle(item)).toBe('Evento event-1');
    expect(getSubscribedItemDateLine(item)).toBe('26/06/2026, 09:00-10:00');
    expect(getSubscribedItemStatusLine(item, [{ eventId: 'event-1', attendedAt: '2026-06-26T09:30:00' }])).toBe(
      'Presença registrada às 26/06/2026, 09:30, Inscrito',
    );
  });

  it('maps grouped subscription date and partial attendance status', () => {
    const item: SubscribedEventGroupItem = {
      __typename: 'SubscribedEventGroupItem',
      id: 'group-item',
      type: 'group',
      startDate: '2026-06-26T09:00:00',
      eventGroup: group(),
      events: [event('first', '2026-06-26T09:00:00'), event('second', '2026-06-27T14:00:00')],
      participation: {
        isSubscribed: true,
        isLecturer: true,
        hasIssuedCertificate: false,
      },
    };

    expect(getSubscribedItemEmoji(item)).toBe('📁');
    expect(getSubscribedItemTitle(item)).toBe('Grupo');
    expect(getSubscribedItemDateLine(item)).toBe('26/06/2026, 09:00 - 27/06/2026, 15:00');
    expect(getSubscribedItemStatusLine(item, [{ eventId: 'first', attendedAt: '2026-06-26T09:30:00' }])).toBe(
      'Presença registrada em 1 de 2 eventos, Inscrito, Palestrante',
    );
  });

  it('keeps confirmed major-event subscriptions quiet but surfaces pending statuses', () => {
    expect(getMajorEventStatusLine(majorEventFeedItem('confirmed', '2026-06-26T09:00:00', 'CONFIRMED'))).toBe(
      'Inscrito',
    );
    expect(
      getMajorEventStatusLine(
        majorEventFeedItem('receipt', '2026-06-26T09:00:00', 'WAITING_RECEIPT_UPLOAD', {
          isSubscribed: true,
          isLecturer: false,
          hasIssuedCertificate: true,
        }),
      ),
    ).toBe('Aguardando envio de comprovante, Inscrito, Certificado emitido');
  });
});

function singleEventItem(id: string, startDate: string): SubscribedSingleEventItem {
  return {
    __typename: 'SubscribedSingleEventItem',
    id,
    type: 'single',
    startDate,
    event: event(id, startDate),
    participation: {
      isSubscribed: true,
      isLecturer: false,
      hasIssuedCertificate: false,
    },
  };
}

function majorEventFeedItem(
  id: string,
  startDate: string,
  subscriptionStatus = 'CONFIRMED',
  participation: CurrentUserMajorEventFeedItem['participation'] = {
    isSubscribed: true,
    isLecturer: false,
    hasIssuedCertificate: false,
  },
): CurrentUserMajorEventFeedItem {
  return {
    id,
    majorEventId: id,
    majorEvent: majorEvent(id, startDate),
    subscriptionStatus,
    participation,
  };
}

function event(id: string, startDate: string): PublicEvent {
  return {
    id,
    name: `Evento ${id}`,
    startDate,
    endDate: addOneHour(startDate),
    emoji: '📌',
    type: 'OTHER',
  };
}

function group(): PublicEventGroup {
  return {
    id: 'group-1',
    name: 'Grupo',
    emoji: '📁',
  };
}

function majorEvent(id: string, startDate: string): PublicMajorEvent {
  return {
    id,
    name: `Grande evento ${id}`,
    emoji: '🎓',
    startDate,
    endDate: addOneHour(startDate),
  };
}

function addOneHour(value: string): string {
  const [date, time] = value.split('T');
  const hour = Number(time.slice(0, 2)) + 1;

  return `${date}T${String(hour).padStart(2, '0')}${time.slice(2)}`;
}
