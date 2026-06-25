import { NotFoundException } from '@nestjs/common';
import { CurrentUserPublicEventService } from './public-event.service';
import { MAJOR_EVENT_BASE_SELECT, MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT } from './selects';
import {
  PUBLIC_EVENT_GROUP_SELECT,
  PUBLIC_EVENT_SELECT,
  PUBLIC_EVENT_WHERE,
  PUBLIC_MAJOR_EVENT_SELECT,
  PUBLIC_MAJOR_EVENT_WHERE,
} from '../public-events/models';

describe('CurrentUserPublicEventService', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    event: { findFirst: jest.Mock };
    eventGroup: { findFirst: jest.Mock };
    majorEvent: { findFirst: jest.Mock };
  };
  let service: CurrentUserPublicEventService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      event: { findFirst: jest.fn() },
      eventGroup: { findFirst: jest.fn() },
      majorEvent: { findFirst: jest.fn() },
    };
    service = new CurrentUserPublicEventService(prisma as never);
  });

  it('requires public events by id with deleted records excluded', async () => {
    const event = { id: 'event-1', name: 'Talk' };
    prisma.event.findFirst.mockResolvedValue(event);

    await expect(service.requirePublicEvent('event-1')).resolves.toBe(event);
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { AND: [PUBLIC_EVENT_WHERE, { id: 'event-1' }] },
      select: PUBLIC_EVENT_SELECT,
    });
  });

  it('throws when required records are missing', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    prisma.eventGroup.findFirst.mockResolvedValue(null);
    prisma.majorEvent.findFirst.mockResolvedValue(null);

    await expect(service.requirePublicEvent('event-1')).rejects.toThrow(NotFoundException);
    await expect(service.requirePublicEventGroup('group-1')).rejects.toThrow(NotFoundException);
    await expect(service.requirePublicMajorEvent('major-event-1')).rejects.toThrow(NotFoundException);
  });

  it('requires event groups and major events with their public selects', async () => {
    const eventGroup = { id: 'group-1', name: 'Group' };
    const majorEvent = majorEventFixture();
    prisma.eventGroup.findFirst.mockResolvedValue(eventGroup);
    prisma.majorEvent.findFirst.mockResolvedValue(majorEvent);

    await expect(service.requirePublicEventGroup('group-1')).resolves.toBe(eventGroup);
    await expect(service.requirePublicMajorEvent('major-event-1')).resolves.toEqual(
      expect.objectContaining({ id: 'major-event-1', shouldIssueCertificate: false }),
    );

    expect(prisma.eventGroup.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null, events: { some: PUBLIC_EVENT_WHERE } },
      select: PUBLIC_EVENT_GROUP_SELECT,
    });
    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: { ...PUBLIC_MAJOR_EVENT_WHERE, id: 'major-event-1' },
      select: PUBLIC_MAJOR_EVENT_SELECT,
    });
  });

  it('chooses major-event selects based on payment-info table availability', () => {
    expect(service.getMajorEventSelect(true)).toBe(MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT);
    expect(service.getMajorEventSelect(false)).toBe(MAJOR_EVENT_BASE_SELECT);
    expect(service.getMajorEventSubscriptionSelect(true).majorEvent.select).toBe(MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT);
  });

  it('caches payment-info table existence checks', async () => {
    prisma.$queryRaw.mockResolvedValue([{ exists: true }]);

    await expect(service.hasPaymentInfoTable()).resolves.toBe(true);
    await expect(service.hasPaymentInfoTable()).resolves.toBe(true);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

function majorEventFixture() {
  return {
    id: 'major-event-1',
    name: 'Major Event',
    emoji: '🎉',
    startDate: new Date('2026-05-21T12:00:00.000Z'),
    endDate: new Date('2026-05-22T12:00:00.000Z'),
    description: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    isPaymentRequired: false,
    additionalPaymentInfo: null,
    certificateConfigs: [],
    majorEventPrices: [],
  };
}
