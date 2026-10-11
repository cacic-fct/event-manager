import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import {
  MutableStoryContext,
  PublicEventStoryControls,
  createMutableStoryContext,
  createPublicStoryEvent,
  createPublicStoryEventFromControls,
  publicEventStoryControlArgTypes,
  publicEventStoryDefaultControls,
} from '../../testing/public-event-story-fixtures';

export type OnlineAttendanceStoryState = 'ready' | 'empty' | 'error' | 'loading';
export type OnlineAttendanceConfirmationOutcome = 'success' | 'invalid-code' | 'rate-limited' | 'server-error';

export interface OnlineAttendanceStoryControls extends PublicEventStoryControls {
  state: OnlineAttendanceStoryState;
  eventCount: number;
  latencyMs: number;
  confirmationOutcome: OnlineAttendanceConfirmationOutcome;
  expectedCode: string;
  retryAfterSeconds: number;
  unregisteredWalkIn: boolean;
}

export const onlineAttendanceStoryDefaultControls: OnlineAttendanceStoryControls = {
  ...publicEventStoryDefaultControls,
  state: 'ready',
  eventCount: 4,
  latencyMs: 120,
  confirmationOutcome: 'success',
  expectedCode: 'A1B2',
  retryAfterSeconds: 8,
  unregisteredWalkIn: false,
};

export const onlineAttendanceStoryControlArgTypes = {
  ...publicEventStoryControlArgTypes,
  state: {
    control: 'select',
    options: ['ready', 'empty', 'loading', 'error'],
    description: 'Selects the loading state for the pending attendance query.',
  },
  eventCount: {
    control: { type: 'range', min: 0, max: 12, step: 1 },
    description: 'Sets how many deterministic pending events the mock generates.',
  },
  latencyMs: {
    control: { type: 'range', min: 0, max: 2_000, step: 100 },
    description: 'Sets the simulated latency for GraphQL operations.',
  },
  confirmationOutcome: {
    control: 'select',
    options: ['success', 'invalid-code', 'rate-limited', 'server-error'],
    description: 'Selects the response returned when the participant confirms the code.',
  },
  expectedCode: { control: 'text', description: 'Sets the four-character code accepted by the mock.' },
  unregisteredWalkIn: { control: 'boolean', description: 'Allows manual attendance without a registration or prior interest.' },
  retryAfterSeconds: {
    control: { type: 'range', min: 1, max: 60, step: 1 },
    description: 'Sets the retry delay shown after too many attempts.',
  },
} as const;

export function createOnlineAttendanceStoryContext(
  args: Partial<OnlineAttendanceStoryControls> = {},
): MutableStoryContext<OnlineAttendanceStoryControls> {
  return createMutableStoryContext(onlineAttendanceStoryDefaultControls, args);
}

export function renderOnlineAttendanceStory(
  args: OnlineAttendanceStoryControls,
  context: MutableStoryContext<OnlineAttendanceStoryControls>,
) {
  context.args = { ...onlineAttendanceStoryDefaultControls, ...args };
  return { props: {} };
}

export function createOnlineAttendancePendingEvents(controls: OnlineAttendanceStoryControls) {
  if (controls.state === 'empty') {
    return [];
  }

  const count = Math.min(Math.max(Math.trunc(controls.eventCount), 0), 12);
  faker.seed(20_260_816);

  return Array.from({ length: count }, (_, index) => {
    if (index === 0) {
      return createPublicStoryEventFromControls(controls, { id: 'event-1', index: 0 });
    }

    const eventNames = [
      'Acessibilidade em produtos digitais',
      'Observabilidade para APIs GraphQL',
      'Robótica para a comunidade',
      'Segurança aplicada',
      'Oficina de interfaces inclusivas',
    ];

    return createPublicStoryEvent({
      id: `event-${index + 1}`,
      index,
      name: eventNames[(index - 1) % eventNames.length],
      emoji: ['♿', '📡', '🤖', '🔐', '🎨'][index % 5],
      context: index % 3 === 0 ? 'event-group' : index % 3 === 1 ? 'major-event' : 'short-description',
      shortDescription: faker.company.catchPhrase(),
      locationDescription: faker.location.streetAddress(),
      dayOffset: index % 3,
      startHour: 9 + (index % 8),
      durationHours: 1 + (index % 3),
    });
  });
}

export function onlineAttendanceStoryHandlers(context: MutableStoryContext<OnlineAttendanceStoryControls>) {
  return [
    http.post('/api/graphql', async ({ request }) => {
      const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
      const query = body.query ?? '';
      const controls = context.args;

      if (controls.state === 'loading') {
        await delay('infinite');
      } else if (controls.latencyMs > 0) {
        await delay(controls.latencyMs);
      }

      if (query.includes('CurrentUserWalkInAttendanceEvent')) {
        const publicEvent = controls.state === 'empty'
          ? null
          : {
              ...createPublicStoryEventFromControls(controls, { id: 'event-1' }),
              attendanceEligibility: 'ANYONE',
              shouldCollectAttendance: true,
              isOnlineAttendanceAllowed: true,
              startDate: publicFixtureDateFromNow(-1),
              endDate: publicFixtureDateFromNow(1),
              onlineAttendanceStartDate: publicFixtureDateFromNow(-1),
              onlineAttendanceEndDate: publicFixtureDateFromNow(1),
            };
        return HttpResponse.json({ data: { publicEvent, currentUserEventAttendance: null } });
      }

      if (query.includes('CurrentUserPendingOnlineAttendanceEvents')) {
        if (controls.state === 'error') {
          return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar as presenças pendentes.' }] });
        }

        return HttpResponse.json({
          data: {
            currentUserPendingOnlineAttendanceEvents: (controls.unregisteredWalkIn ? [] : createOnlineAttendancePendingEvents(controls)).map((event) => ({
              eventId: event.id,
              event,
            })),
          },
        });
      }

      if (query.includes('ConfirmCurrentUserOnlineAttendance')) {
        const submittedCode = String(body.variables?.['code'] ?? '').toUpperCase();
        if (controls.confirmationOutcome === 'invalid-code' || submittedCode !== controls.expectedCode.toUpperCase()) {
          return HttpResponse.json({ errors: [{ message: 'Código de presença inválido.' }] });
        }
        if (controls.confirmationOutcome === 'rate-limited') {
          return HttpResponse.json({
            errors: [
              {
                message: 'Muitas tentativas.',
                extensions: { code: 'RATE_LIMITED', retryAfterSeconds: controls.retryAfterSeconds },
              },
            ],
          });
        }
        if (controls.confirmationOutcome === 'server-error') {
          return HttpResponse.json({ errors: [{ message: 'Não foi possível confirmar presença.' }] });
        }

        return HttpResponse.json({
          data: {
            confirmCurrentUserOnlineAttendance: {
              eventId: String(body.variables?.['eventId'] ?? 'event-1'),
              attendedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          },
        });
      }

      return HttpResponse.json({ data: {} });
    }),
  ];
}
