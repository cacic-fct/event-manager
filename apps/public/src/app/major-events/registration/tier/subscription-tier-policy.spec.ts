import { createPublicEvent, createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import {
  automaticEventIds,
  automaticSelectionLimitViolations,
  categoryLimits,
  selectableEventIds,
  subscriptionTierRuleSummaries,
} from './subscription-tier-policy';

describe('subscription tier policy', () => {
  const events = [
    createPublicEvent({ id: 'course-a', eventGroupId: 'course-group', type: 'MINICURSO' }),
    createPublicEvent({ id: 'course-b', eventGroupId: 'course-group', type: 'MINICURSO' }),
    createPublicEvent({ id: 'lecture', eventGroupId: null, type: 'PALESTRA' }),
  ];

  it.each([undefined, false])('keeps the existing full event list when restriction is %s', (restricted) => {
    expect(
      selectableEventIds(events, {
        id: 'tier',
        name: 'Base',
        value: 0,
        includesSportsRegistration: false,
        restrictEventSelection: restricted,
      }),
    ).toEqual(new Set(events.map((event) => event.id)));
  });

  it('returns no selectable events for an enabled empty whitelist', () => {
    expect(
      selectableEventIds(events, {
        id: 'empty',
        name: 'Sem eventos',
        value: 0,
        includesSportsRegistration: false,
        restrictEventSelection: true,
        allowedEventIds: [],
      }),
    ).toEqual(new Set());
  });

  it('keeps grouped events together and excludes partially authorized groups', () => {
    const tier = {
      id: 'limited',
      name: 'Limitada',
      value: 0,
      includesSportsRegistration: false,
      restrictEventSelection: true,
      allowedEventIds: ['course-a', 'lecture'],
    };

    expect(selectableEventIds(events, tier)).toEqual(new Set(['lecture']));
    expect(selectableEventIds(events, { ...tier, allowedEventIds: ['course-a', 'course-b', 'lecture'] })).toEqual(
      new Set(events.map((event) => event.id)),
    );
  });

  it('expands restricted automatic selection to every allowed group member', () => {
    const automaticEvents = [
      createPublicEvent({ id: 'course-a', eventGroupId: 'course-group', type: 'MINICURSO', autoSubscribe: true }),
      createPublicEvent({ id: 'course-b', eventGroupId: 'course-group', type: 'MINICURSO', autoSubscribe: false }),
    ];
    const tier = {
      id: 'limited',
      name: 'Limitada',
      value: 0,
      includesSportsRegistration: false,
      restrictEventSelection: true,
      allowedEventIds: ['course-a', 'course-b'],
    };

    expect(automaticEventIds(automaticEvents, tier)).toEqual(new Set(['course-a', 'course-b']));
    expect(automaticEventIds(automaticEvents, null)).toEqual(new Set(['course-a']));
    expect(automaticEventIds(automaticEvents, { ...tier, allowedEventIds: ['course-a'] })).toEqual(new Set());
  });

  it('reports mandatory automatic selections that exceed effective tier limits', () => {
    const automaticEvents = [
      createPublicEvent({ id: 'course-a', eventGroupId: 'course-group', type: 'MINICURSO', autoSubscribe: true }),
      createPublicEvent({ id: 'course-b', eventGroupId: 'course-group', type: 'MINICURSO', autoSubscribe: false }),
    ];
    const majorEvent = createPublicMajorEvent({ maxCoursesPerAttendee: 1 });
    const tier = {
      id: 'limited',
      name: 'Limitada',
      value: 0,
      includesSportsRegistration: false,
      restrictEventSelection: true,
      allowedEventIds: ['course-a', 'course-b'],
      customizeSubscriptionLimits: true,
      maxCoursesPerAttendee: 1,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: null,
    };

    expect(automaticSelectionLimitViolations(majorEvent, automaticEvents, tier)).toEqual([
      'A inscrição automática inclui 2 minicurso(s), acima do limite desta modalidade de 1.',
    ]);
    expect(
      automaticSelectionLimitViolations(majorEvent, automaticEvents, {
        ...tier,
        maxCoursesPerAttendee: null,
      }),
    ).toEqual([]);
  });

  it('inherits global limits unless the tier enables custom limits', () => {
    const majorEvent = createPublicMajorEvent({
      maxCoursesPerAttendee: 2,
      maxLecturesPerAttendee: 3,
      maxUncategorizedPerAttendee: 4,
    });
    const baseTier = {
      id: 'tier',
      name: 'Base',
      value: 0,
      includesSportsRegistration: false,
      maxCoursesPerAttendee: 0,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: 1,
    };

    expect(categoryLimits(majorEvent, { ...baseTier, customizeSubscriptionLimits: false })).toEqual({
      course: 2,
      lecture: 3,
      uncategorized: 4,
    });
    expect(categoryLimits(majorEvent, { ...baseTier, customizeSubscriptionLimits: true })).toEqual({
      course: 0,
      lecture: null,
      uncategorized: 1,
    });
  });

  it('describes an empty restricted tier and zero/unlimited category quotas', () => {
    const majorEvent = createPublicMajorEvent();
    const summaries = subscriptionTierRuleSummaries(majorEvent, {
      id: 'tier',
      name: 'Restrita',
      value: 0,
      includesSportsRegistration: false,
      restrictEventSelection: true,
      allowedEventIds: [],
      customizeSubscriptionLimits: true,
      maxCoursesPerAttendee: 0,
      maxLecturesPerAttendee: null,
      maxUncategorizedPerAttendee: 2,
    });

    expect(summaries).toContain('Esta modalidade não tem eventos disponíveis para seleção.');
    expect(summaries).toContain('minicursos: não permitidos.');
    expect(summaries).toContain('palestras: sem limite.');
    expect(summaries).toContain('outros eventos: até 2.');
  });
});
