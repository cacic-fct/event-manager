import type { EventType, PublicEvent, PublicEventGroup, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { createPublicEvent, createPublicEventGroup, createPublicMajorEvent } from './public-entity-fixtures';

export type PublicEventStoryContext = 'major-event' | 'event-group' | 'short-description';

export interface PublicEventStoryOptions extends Partial<PublicEvent> {
  id?: string;
  index?: number;
  name?: string;
  emoji?: string;
  type?: EventType;
  context?: PublicEventStoryContext;
  majorEventName?: string;
  eventGroupName?: string;
  shortDescription?: string | null;
  locationDescription?: string | null;
  dayOffset?: number;
  startHour?: number;
  durationHours?: number;
  slotsAvailable?: number | null;
  queueCount?: number;
}

export interface PublicEventStoryControls {
  name: string;
  emoji: string;
  type: EventType;
  context: PublicEventStoryContext;
  majorEventName: string;
  eventGroupName: string;
  shortDescription: string;
  locationDescription: string;
  dayOffset: number;
  startHour: number;
  durationHours: number;
  slotsAvailable: number;
  queueCount: number;
}

export interface MutableStoryContext<TArgs> {
  args: TArgs;
}

export function createMutableStoryContext<TArgs>(defaults: TArgs, args: Partial<TArgs> = {}): MutableStoryContext<TArgs> {
  return {
    args: { ...defaults, ...args },
  };
}

export function renderMutableStory<TArgs>(defaults: TArgs, args: TArgs, context: MutableStoryContext<TArgs>) {
  context.args = { ...defaults, ...args };
  return { props: {} };
}

export const publicEventStoryDefaultControls: PublicEventStoryControls = {
  name: 'Arquitetura Angular com Signals',
  emoji: '🧠',
  type: 'MINICURSO',
  context: 'major-event',
  majorEventName: 'CACiC Storybook',
  eventGroupName: 'Trilha Frontend',
  shortDescription: 'Sessão aberta para a comunidade.',
  locationDescription: 'Laboratório 01',
  dayOffset: 0,
  startHour: 14,
  durationHours: 2,
  slotsAvailable: 12,
  queueCount: 3,
};

export const publicEventStoryControlArgTypes = {
  name: { control: 'text' },
  emoji: { control: 'text' },
  type: { control: 'select', options: ['MINICURSO', 'PALESTRA', 'OTHER'] },
  context: { control: 'select', options: ['major-event', 'event-group', 'short-description'] },
  majorEventName: { control: 'text' },
  eventGroupName: { control: 'text' },
  shortDescription: { control: 'text' },
  locationDescription: { control: 'text' },
  dayOffset: { control: { type: 'range', min: -30, max: 45, step: 1 } },
  startHour: { control: { type: 'range', min: 0, max: 22, step: 1 } },
  durationHours: { control: { type: 'range', min: 1, max: 8, step: 1 } },
  slotsAvailable: { control: { type: 'range', min: 0, max: 80, step: 1 } },
  queueCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
} as const;

export function publicStoryDate(dayOffset: number, hour = 14): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

export function publicStoryDateObject(dayOffset: number, hour = 12): Date {
  return new Date(publicStoryDate(dayOffset, hour));
}

export function publicStoryWeekDays(baseDate = startOfPublicStoryWeek()): Array<{ label: string; date: Date }> {
  return ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, index) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + index);
    return { label, date };
  });
}

export function startOfPublicStoryWeek(reference = new Date()): Date {
  const date = new Date(reference);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export function createPublicStoryMajorEvent(overrides: Partial<PublicMajorEvent> = {}): PublicMajorEvent {
  return createPublicMajorEvent({
    id: 'major-story',
    name: 'CACiC Storybook',
    emoji: '💻',
    startDate: publicStoryDate(-2, 9),
    endDate: publicStoryDate(6, 20),
    subscriptionStartDate: publicStoryDate(-20, 8),
    subscriptionEndDate: publicStoryDate(4, 23),
    ...overrides,
  });
}

export function createPublicStoryEventGroup(overrides: Partial<PublicEventGroup> = {}): PublicEventGroup {
  return createPublicEventGroup({
    id: 'group-story',
    name: 'Trilha Frontend',
    emoji: '✨',
    ...overrides,
  });
}

export function createPublicStoryEvent(options: PublicEventStoryOptions = {}): PublicEvent {
  const index = options.index ?? 0;
  const dayOffset = options.dayOffset ?? index;
  const startHour = options.startHour ?? 14;
  const durationHours = options.durationHours ?? 2;
  const context = options.context ?? 'major-event';
  const majorEvent =
    context === 'major-event' ? createPublicStoryMajorEvent({ name: options.majorEventName ?? 'CACiC Storybook' }) : null;
  const eventGroup =
    context === 'event-group' ? createPublicStoryEventGroup({ name: options.eventGroupName ?? 'Trilha Frontend' }) : null;

  return createPublicEvent({
    id: options.id ?? `public-story-event-${index + 1}`,
    name:
      options.name ??
      ['Arquitetura Angular com Signals', 'Acessibilidade em produtos digitais', 'Observabilidade para APIs GraphQL'][
        index % 3
      ],
    emoji: options.emoji ?? ['🧠', '♿', '📡'][index % 3],
    type: options.type ?? (['MINICURSO', 'PALESTRA', 'OTHER'] as const)[index % 3],
    shortDescription: context === 'short-description' ? (options.shortDescription ?? 'Sessão aberta para a comunidade.') : null,
    locationDescription: options.locationDescription ?? 'Laboratório 01',
    majorEventId: majorEvent?.id ?? null,
    majorEvent,
    eventGroupId: eventGroup?.id ?? null,
    eventGroup,
    startDate: publicStoryDate(dayOffset, startHour),
    endDate: publicStoryDate(dayOffset, startHour + durationHours),
    onlineAttendanceStartDate: publicStoryDate(dayOffset, startHour - 1),
    onlineAttendanceEndDate: publicStoryDate(dayOffset, startHour + durationHours + 1),
    subscriptionStartDate: publicStoryDate(-10, 8),
    subscriptionEndDate: publicStoryDate(dayOffset, 23),
    slotsAvailable: options.slotsAvailable === undefined ? 12 : options.slotsAvailable,
    queueCount: options.queueCount ?? 3,
  });
}

export function createPublicStoryEventFromControls(
  controls: Partial<PublicEventStoryControls> = {},
  options: PublicEventStoryOptions = {},
): PublicEvent {
  const merged = { ...publicEventStoryDefaultControls, ...controls };

  return createPublicStoryEvent({
    name: merged.name,
    emoji: merged.emoji,
    type: merged.type,
    context: merged.context,
    majorEventName: merged.majorEventName,
    eventGroupName: merged.eventGroupName,
    shortDescription: merged.shortDescription,
    locationDescription: merged.locationDescription,
    dayOffset: merged.dayOffset,
    startHour: merged.startHour,
    durationHours: merged.durationHours,
    slotsAvailable: merged.slotsAvailable,
    queueCount: merged.queueCount,
    ...options,
  });
}

export function createPublicStoryEvents(controls: Partial<PublicEventStoryControls> = {}): PublicEvent[] {
  return [
    createPublicStoryEventFromControls(controls, { index: 0 }),
    createPublicStoryEvent({
      index: 1,
      dayOffset: 1,
      startHour: 10,
      context: 'event-group',
      slotsAvailable: 0,
      queueCount: 8,
    }),
    createPublicStoryEvent({
      index: 2,
      dayOffset: 8,
      startHour: 18,
      context: 'short-description',
      slotsAvailable: null,
      queueCount: 0,
    }),
  ];
}

export {
  publicEventStoryControlArgTypes as calendarStoryEventControlArgTypes,
  publicEventStoryDefaultControls as calendarStoryEventDefaultControls,
  publicStoryDate as calendarStoryDate,
  publicStoryDateObject as calendarStoryDateObject,
  publicStoryWeekDays as calendarStoryWeekDays,
  startOfPublicStoryWeek as startOfCalendarStoryWeek,
  createPublicStoryMajorEvent as createCalendarStoryMajorEvent,
  createPublicStoryEventGroup as createCalendarStoryEventGroup,
  createPublicStoryEvent as createCalendarStoryEvent,
  createPublicStoryEventFromControls as createCalendarStoryEventFromControls,
  createPublicStoryEvents as createCalendarStoryEvents,
};

export type {
  PublicEventStoryContext as CalendarStoryContext,
  PublicEventStoryControls as CalendarStoryEventControls,
  PublicEventStoryOptions as CalendarStoryEventOptions,
};
