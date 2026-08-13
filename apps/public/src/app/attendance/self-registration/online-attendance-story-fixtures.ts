import { HttpResponse, delay, http } from 'msw';
import { createPublicStoryEvent } from '../../testing/public-event-story-fixtures';

export type OnlineAttendanceStoryState = 'ready' | 'empty' | 'error' | 'loading';

const pendingEvents = [
  createPublicStoryEvent({
    id: 'event-1',
    name: 'Arquitetura Angular com Signals',
    emoji: '🧠',
    dayOffset: 0,
    startHour: 14,
  }),
  createPublicStoryEvent({
    id: 'event-2',
    index: 1,
    name: 'Acessibilidade em produtos digitais',
    emoji: '♿',
    dayOffset: 0,
    startHour: 16,
  }),
];

export function onlineAttendanceStoryHandlers(state: OnlineAttendanceStoryState = 'ready') {
  return [
    http.post('/api/graphql', async ({ request }) => {
      const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
      const query = body.query ?? '';

      if (query.includes('CurrentUserPendingOnlineAttendanceEvents')) {
        if (state === 'loading') {
          await delay('infinite');
        }

        if (state === 'error') {
          return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar as presenças pendentes.' }] });
        }

        return HttpResponse.json({
          data: {
            currentUserPendingOnlineAttendanceEvents:
              state === 'empty' ? [] : pendingEvents.map((event) => ({ eventId: event.id, event })),
          },
        });
      }

      if (query.includes('ConfirmCurrentUserOnlineAttendance')) {
        return HttpResponse.json({
          data: {
            confirmCurrentUserOnlineAttendance: {
              eventId: String(body.variables?.['eventId'] ?? pendingEvents[0]?.id),
              attendedAt: new Date('2026-08-13T17:00:00.000Z').toISOString(),
              createdAt: new Date('2026-08-13T17:00:00.000Z').toISOString(),
            },
          },
        });
      }

      return HttpResponse.json({ data: {} });
    }),
  ];
}
