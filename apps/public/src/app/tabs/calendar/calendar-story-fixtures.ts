import type { EventType, PublicEvent, PublicEventGroup, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { createPublicEvent, createPublicEventGroup, createPublicMajorEvent } from '../../testing/public-entity-fixtures';

export type CalendarStoryContext = 'major-event' | 'event-group' | 'short-description';

export interface CalendarStoryEventOptions {
  id?: string;
  index?: number;
  name?: string;
  type?: EventType;
  context?: CalendarStoryContext;
  dayOffset?: number;
  startHour?: number;
  durationHours?: number;
  slotsAvailable?: number | null;
  queueCount?: number;
}

export function calendarStoryDate(dayOffset: number, hour = 14): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

export function calendarStoryDateObject(dayOffset: number, hour = 12): Date {
  return new Date(calendarStoryDate(dayOffset, hour));
}

export function calendarStoryWeekDays(baseDate = startOfCalendarStoryWeek()): Array<{ label: string; date: Date }> {
  return ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    return { label, date };
  });
}

export function startOfCalendarStoryWeek(reference = new Date()): Date {
  const date = new Date(reference);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function createCalendarStoryMajorEvent(overrides: Partial<PublicMajorEvent> = {}): PublicMajorEvent {
  return createPublicMajorEvent({
    id: 'major-story',
    name: 'CACiC Storybook',
    emoji: 'computer',
    startDate: calendarStoryDate(-2, 9),
    endDate: calendarStoryDate(6, 20),
    subscriptionStartDate: calendarStoryDate(-20, 8),
    subscriptionEndDate: calendarStoryDate(4, 23),
    ...overrides,
  });
}

export function createCalendarStoryEventGroup(overrides: Partial<PublicEventGroup> = {}): PublicEventGroup {
  return createPublicEventGroup({
    id: 'group-story',
    name: 'Trilha Frontend',
    emoji: 'web',
    ...overrides,
  });
}

export function createCalendarStoryEvent(options: CalendarStoryEventOptions = {}): PublicEvent {
  const index = options.index ?? 0;
  const dayOffset = options.dayOffset ?? index;
  const startHour = options.startHour ?? 14;
  const durationHours = options.durationHours ?? 2;
  const context = options.context ?? 'major-event';
  const majorEvent = context === 'major-event' ? createCalendarStoryMajorEvent() : null;
  const eventGroup = context === 'event-group' ? createCalendarStoryEventGroup() : null;

  return createPublicEvent({
    id: options.id ?? `calendar-story-event-${index + 1}`,
    name:
      options.name ??
      ['Arquitetura Angular com Signals', 'Acessibilidade em produtos digitais', 'Observabilidade para APIs GraphQL'][
        index % 3
      ],
    emoji: ['psychology', 'accessibility_new', 'monitoring'][index % 3],
    type: options.type ?? (['MINICURSO', 'PALESTRA', 'OTHER'] as const)[index % 3],
    shortDescription: context === 'short-description' ? 'Sessão aberta para a comunidade.' : null,
    majorEventId: majorEvent?.id ?? null,
    majorEvent,
    eventGroupId: eventGroup?.id ?? null,
    eventGroup,
    startDate: calendarStoryDate(dayOffset, startHour),
    endDate: calendarStoryDate(dayOffset, startHour + durationHours),
    onlineAttendanceStartDate: calendarStoryDate(dayOffset, startHour - 1),
    onlineAttendanceEndDate: calendarStoryDate(dayOffset, startHour + durationHours + 1),
    subscriptionStartDate: calendarStoryDate(-10, 8),
    subscriptionEndDate: calendarStoryDate(dayOffset, 23),
    slotsAvailable: options.slotsAvailable ?? 12,
    queueCount: options.queueCount ?? 3,
  });
}

export function createCalendarStoryEvents(): PublicEvent[] {
  return [
    createCalendarStoryEvent({ index: 0, dayOffset: 0, startHour: 14, context: 'major-event' }),
    createCalendarStoryEvent({
      index: 1,
      dayOffset: 1,
      startHour: 10,
      context: 'event-group',
      slotsAvailable: 0,
      queueCount: 8,
    }),
    createCalendarStoryEvent({
      index: 2,
      dayOffset: 8,
      startHour: 18,
      context: 'short-description',
      slotsAvailable: null,
      queueCount: 0,
    }),
  ];
}
