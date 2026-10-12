import { BadRequestException } from '@nestjs/common';
import {
  ensureTierAllowsEventIds,
  getTierAutomaticEventIds,
  getTierEligibleEvents,
  resolvePriceTierEventPolicy,
} from './tier-event-policy';

describe('major-event price-tier event policy', () => {
  it('ignores retained tier rules when payment is disabled', () => {
    expect(
      resolvePriceTierEventPolicy(
        {
          isPaymentRequired: false,
          maxCoursesPerAttendee: 2,
          majorEventPrices: [
            {
              tiers: [
                {
                  name: 'Aluno',
                  includesEventRegistration: false,
                  restrictEventSelection: true,
                  allowedEventIds: [],
                  customizeSubscriptionLimits: true,
                  maxCoursesPerAttendee: 0,
                },
              ],
            },
          ],
        },
        null,
      ),
    ).toEqual(
      expect.objectContaining({
        restrictEventSelection: false,
        customizeSubscriptionLimits: false,
        allowedEventIds: null,
        maxCoursesPerAttendee: 2,
      }),
    );
  });

  it('keeps legacy tiers unrestricted and inherits major-event category limits', () => {
    expect(
      resolvePriceTierEventPolicy(
        {
          maxCoursesPerAttendee: 2,
          maxLecturesPerAttendee: 3,
          maxUncategorizedPerAttendee: null,
          majorEventPrices: [
            {
              tiers: [
                {
                  name: 'Student',
                  restrictEventSelection: false,
                  allowedEventIds: ['ignored-event'],
                  customizeSubscriptionLimits: false,
                  maxCoursesPerAttendee: 8,
                },
              ],
            },
          ],
        },
        ' student ',
      ),
    ).toEqual({
      restrictEventSelection: false,
      customizeSubscriptionLimits: false,
      allowedEventIds: null,
      maxCoursesPerAttendee: 2,
      maxLecturesPerAttendee: 3,
      maxUncategorizedPerAttendee: null,
    });
  });

  it('fails closed when tier restrictions are configured but the selected tier cannot be matched', () => {
    expect(() =>
      resolvePriceTierEventPolicy(
        {
          majorEventPrices: [
            {
              tiers: [
                {
                  name: 'Student',
                  restrictEventSelection: true,
                  allowedEventIds: ['event-1'],
                },
              ],
            },
          ],
        },
        'unknown',
      ),
    ).toThrow(BadRequestException);
  });

  it('denies activity selection for tiers that exclude event registration', () => {
    const policy = resolvePriceTierEventPolicy(
      {
        majorEventPrices: [
          {
            tiers: [
              {
                name: 'Sports only',
                includesEventRegistration: false,
                restrictEventSelection: false,
                customizeSubscriptionLimits: false,
              },
            ],
          },
        ],
      },
      'Sports only',
    );

    expect(policy.allowedEventIds).toEqual(new Set());
    expect(() => ensureTierAllowsEventIds(policy, ['event-1'], [{ id: 'event-1', eventGroupId: null }])).toThrow(
      BadRequestException,
    );
  });

  it('rejects blocked events and keeps a partially allowed group out of explicit and automatic selection', () => {
    const policy = resolvePriceTierEventPolicy(
      {
        majorEventPrices: [
          {
            tiers: [
              {
                name: 'Student',
                restrictEventSelection: true,
                allowedEventIds: ['group-event-1', 'open-auto'],
              },
            ],
          },
        ],
      },
      'STUDENT',
    );
    const events = [
      { id: 'group-event-1', eventGroupId: 'group-1', autoSubscribe: true },
      { id: 'group-event-2', eventGroupId: 'group-1', autoSubscribe: true },
      { id: 'open-auto', eventGroupId: null, autoSubscribe: true },
      { id: 'blocked-auto', eventGroupId: null, autoSubscribe: true },
    ];

    expect(() => ensureTierAllowsEventIds(policy, ['blocked-auto'], events)).toThrow(BadRequestException);
    expect(() => ensureTierAllowsEventIds(policy, ['group-event-1'], events)).toThrow(BadRequestException);
    expect(getTierEligibleEvents(policy, events).map((event) => event.id)).toEqual(['open-auto']);
    expect(getTierAutomaticEventIds(policy, events)).toEqual(['open-auto']);
  });

  it('auto-selects a full group only when every group event is allowed', () => {
    const policy = resolvePriceTierEventPolicy(
      {
        majorEventPrices: [
          {
            tiers: [
              {
                name: 'Student',
                restrictEventSelection: true,
                allowedEventIds: ['group-event-1', 'group-event-2'],
              },
            ],
          },
        ],
      },
      'Student',
    );
    const events = [
      { id: 'group-event-1', eventGroupId: 'group-1', autoSubscribe: true },
      { id: 'group-event-2', eventGroupId: 'group-1', autoSubscribe: false },
    ];

    expect(getTierAutomaticEventIds(policy, events)).toEqual(['group-event-1', 'group-event-2']);
  });

  it('does not expose an available child when an active hidden group member is restricted', () => {
    const policy = resolvePriceTierEventPolicy(
      {
        majorEventPrices: [
          {
            tiers: [
              {
                name: 'Student',
                restrictEventSelection: true,
                allowedEventIds: ['visible-child'],
              },
            ],
          },
        ],
      },
      'Student',
    );
    const availableEvents = [{ id: 'visible-child', eventGroupId: 'group-1', autoSubscribe: true }];
    const allActiveGroupEvents = [
      ...availableEvents,
      { id: 'hidden-child', eventGroupId: 'group-1', autoSubscribe: false },
    ];

    expect(getTierEligibleEvents(policy, availableEvents, allActiveGroupEvents)).toEqual([]);
    expect(getTierAutomaticEventIds(policy, availableEvents, allActiveGroupEvents)).toEqual([]);
    expect(() => ensureTierAllowsEventIds(policy, ['visible-child'], allActiveGroupEvents)).toThrow(
      BadRequestException,
    );
  });

  it('uses customized limits, including values above, below, zero, and null for unlimited', () => {
    const resolve = (limits: { courses: number | null; lectures: number | null; uncategorized: number | null }) =>
      resolvePriceTierEventPolicy(
        {
          maxCoursesPerAttendee: 1,
          maxLecturesPerAttendee: 2,
          maxUncategorizedPerAttendee: 3,
          majorEventPrices: [
            {
              tiers: [
                {
                  name: 'Custom',
                  customizeSubscriptionLimits: true,
                  maxCoursesPerAttendee: limits.courses,
                  maxLecturesPerAttendee: limits.lectures,
                  maxUncategorizedPerAttendee: limits.uncategorized,
                },
              ],
            },
          ],
        },
        'custom',
      );

    expect(resolve({ courses: 5, lectures: 0, uncategorized: null })).toEqual({
      restrictEventSelection: false,
      customizeSubscriptionLimits: true,
      allowedEventIds: null,
      maxCoursesPerAttendee: 5,
      maxLecturesPerAttendee: 0,
      maxUncategorizedPerAttendee: null,
    });
    expect(resolve({ courses: 0, lectures: 1, uncategorized: 2 })).toEqual({
      restrictEventSelection: false,
      customizeSubscriptionLimits: true,
      allowedEventIds: null,
      maxCoursesPerAttendee: 0,
      maxLecturesPerAttendee: 1,
      maxUncategorizedPerAttendee: 2,
    });
  });
});
