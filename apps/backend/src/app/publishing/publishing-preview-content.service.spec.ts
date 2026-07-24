import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { AuditLogEntityType, PublicationPreviewTargetType, PublicationState } from '@prisma/client';
import { PublicationPreviewContentService } from './publishing-preview-content.service';

describe('PublicationPreviewContentService', () => {
  function createService() {
    const prisma = {
      event: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      eventGroup: {
        findFirst: jest.fn(),
      },
      majorEvent: {
        findFirst: jest.fn(),
      },
    };
    const service = new PublicationPreviewContentService(prisma as never);

    return { prisma, service };
  }

  it('keeps a major-event preview when a visible child has unpublished changes', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue({
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-25T10:00:00.000Z'),
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      events: [
        {
          publicationState: PublicationState.PUBLISHED,
          publishedAt: new Date('2026-06-25T10:00:00.000Z'),
          updatedAt: new Date('2026-06-25T11:00:00.000Z'),
        },
      ],
    });

    await expect(
      service.resolveDirectPublishedUrl({
        targetType: PublicationTargetType.MAJOR_EVENT,
        targetId: 'major-1',
      }),
    ).resolves.toBeNull();
  });

  it('returns the direct major-event URL only when visible children are published and fresh', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue({
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-25T10:00:00.000Z'),
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      events: [
        {
          publicationState: PublicationState.PUBLISHED,
          publishedAt: new Date('2026-06-25T10:00:00.000Z'),
          updatedAt: new Date('2026-06-25T09:30:00.000Z'),
        },
      ],
    });

    await expect(
      service.resolveDirectPublishedUrl({
        targetType: PublicationTargetType.MAJOR_EVENT,
        targetId: 'major-1',
      }),
    ).resolves.toBe('http://localhost:4200/major-event');
  });

  it('returns the direct event URL only when the event and parent major event are fresh and published', async () => {
    const { prisma, service } = createService();
    const publishedAt = new Date('2026-06-25T10:00:00.000Z');
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      publiclyVisible: true,
      publicationState: PublicationState.PUBLISHED,
      publishedAt,
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      majorEvent: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
        publishedAt,
        updatedAt: new Date('2026-06-25T09:30:00.000Z'),
      },
    });

    await expect(
      service.resolveDirectPublishedUrl({
        targetType: PublicationTargetType.EVENT,
        targetId: 'event-1',
      }),
    ).resolves.toBe('http://localhost:4200/event/event-1');

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: 'event-1', deletedAt: null },
      select: expect.any(Object),
    });
  });

  it('keeps an event preview when the parent major event has unpublished changes', async () => {
    const { prisma, service } = createService();
    const publishedAt = new Date('2026-06-25T10:00:00.000Z');
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      publiclyVisible: true,
      publicationState: PublicationState.PUBLISHED,
      publishedAt,
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      majorEvent: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
        publishedAt,
        updatedAt: new Date('2026-06-25T11:00:00.000Z'),
      },
    });

    await expect(
      service.resolveDirectPublishedUrl({
        targetType: PublicationTargetType.EVENT,
        targetId: 'event-1',
      }),
    ).resolves.toBeNull();
  });

  it('resolves preview target labels and audit entity types for all target kinds', async () => {
    const { prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValueOnce({ name: 'Evento' });
    prisma.majorEvent.findFirst.mockResolvedValueOnce({ name: 'Grande evento' });
    prisma.eventGroup.findFirst.mockResolvedValueOnce({ name: 'Grupo' });

    await expect(service.resolvePreviewTarget(PublicationTargetType.EVENT, 'event-1')).resolves.toEqual({
      label: 'Evento',
      auditType: AuditLogEntityType.EVENT,
    });
    await expect(service.resolvePreviewTarget(PublicationTargetType.MAJOR_EVENT, 'major-1')).resolves.toEqual({
      label: 'Grande evento',
      auditType: AuditLogEntityType.MAJOR_EVENT,
    });
    await expect(service.resolvePreviewTarget(PublicationTargetType.EVENT_GROUP, 'group-1')).resolves.toEqual({
      label: 'Grupo',
      auditType: AuditLogEntityType.EVENT_GROUP,
    });
  });

  it('throws not found errors when preview targets do not exist', async () => {
    const { prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValueOnce(null);
    prisma.majorEvent.findFirst.mockResolvedValueOnce(null);
    prisma.eventGroup.findFirst.mockResolvedValueOnce(null);

    await expect(service.resolvePreviewTarget(PublicationTargetType.EVENT, 'event-1')).rejects.toThrow(
      'Event event-1 was not found.',
    );
    await expect(service.resolvePreviewTarget(PublicationTargetType.MAJOR_EVENT, 'major-1')).rejects.toThrow(
      'Major event major-1 was not found.',
    );
    await expect(service.resolvePreviewTarget(PublicationTargetType.EVENT_GROUP, 'group-1')).rejects.toThrow(
      'Event group group-1 was not found.',
    );
  });

  it('loads event preview payloads with event, group, parent major event, and single-event list', async () => {
    const { prisma, service } = createService();
    const preview = previewFixture(PublicationPreviewTargetType.EVENT, 'event-1');
    const majorEvent = publicMajorEventFixture();
    const event = {
      id: 'event-1',
      eventGroup: { id: 'group-1', name: 'Grupo' },
      majorEvent,
    };
    prisma.event.findFirst.mockResolvedValue(event);

    await expect(service.loadPreviewPayload(preview)).resolves.toEqual({
      targetType: PublicationPreviewTargetType.EVENT,
      targetId: 'event-1',
      previewAt: preview.previewAt,
      expiresAt: preview.expiresAt,
      event,
      eventGroup: event.eventGroup,
      majorEvent: expect.objectContaining({ id: 'major-1', name: 'Grande evento' }),
      events: [event],
    });
  });

  it('loads major-event preview payloads with visible events ordered by start date', async () => {
    const { prisma, service } = createService();
    const preview = previewFixture(PublicationPreviewTargetType.MAJOR_EVENT, 'major-1');
    const majorEvent = publicMajorEventFixture();
    const events = [
      {
        id: 'event-1',
        majorEvent,
      },
    ];
    prisma.majorEvent.findFirst.mockResolvedValue(majorEvent);
    prisma.event.findMany.mockResolvedValue(events);

    await expect(service.loadPreviewPayload(preview)).resolves.toEqual({
      targetType: PublicationPreviewTargetType.MAJOR_EVENT,
      targetId: 'major-1',
      previewAt: preview.previewAt,
      expiresAt: preview.expiresAt,
      event: null,
      eventGroup: null,
      majorEvent: expect.objectContaining({ id: 'major-1', name: 'Grande evento' }),
      events,
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { majorEventId: 'major-1', deletedAt: null, publiclyVisible: true },
      select: expect.any(Object),
      orderBy: { startDate: 'asc' },
    });
  });

  it('loads event-group preview payloads and derives the parent major event from the first event', async () => {
    const { prisma, service } = createService();
    const preview = previewFixture(PublicationPreviewTargetType.EVENT_GROUP, 'group-1');
    const eventGroup = {
      id: 'group-1',
      name: 'Grupo',
    };
    const events = [
      {
        id: 'event-1',
        majorEvent: publicMajorEventFixture(),
      },
    ];
    prisma.eventGroup.findFirst.mockResolvedValue(eventGroup);
    prisma.event.findMany.mockResolvedValue(events);

    await expect(service.loadPreviewPayload(preview)).resolves.toEqual({
      targetType: PublicationPreviewTargetType.EVENT_GROUP,
      targetId: 'group-1',
      previewAt: preview.previewAt,
      expiresAt: preview.expiresAt,
      event: null,
      eventGroup,
      majorEvent: expect.objectContaining({ id: 'major-1', name: 'Grande evento' }),
      events,
    });
  });

  it('throws when preview payload content was deleted before the preview was opened', async () => {
    const { prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValueOnce(null);
    prisma.majorEvent.findFirst.mockResolvedValueOnce(null);
    prisma.eventGroup.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.loadPreviewPayload(previewFixture(PublicationPreviewTargetType.EVENT, 'event-1')),
    ).rejects.toThrow('Event event-1 was not found.');
    await expect(
      service.loadPreviewPayload(previewFixture(PublicationPreviewTargetType.MAJOR_EVENT, 'major-1')),
    ).rejects.toThrow('Major event major-1 was not found.');
    await expect(
      service.loadPreviewPayload(previewFixture(PublicationPreviewTargetType.EVENT_GROUP, 'group-1')),
    ).rejects.toThrow('Event group group-1 was not found.');
  });
});

function previewFixture(targetType: PublicationPreviewTargetType, targetId: string) {
  return {
    targetType,
    targetId,
    previewAt: new Date('2026-06-25T09:00:00.000Z'),
    expiresAt: new Date('2026-06-25T09:15:00.000Z'),
  };
}

function publicMajorEventFixture() {
  return {
    id: 'major-1',
    name: 'Grande evento',
    emoji: 'GE',
    startDate: new Date('2026-06-25T10:00:00.000Z'),
    endDate: new Date('2026-06-25T20:00:00.000Z'),
    description: null,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    isPaymentRequired: false,
    additionalPaymentInfo: null,
    publicationState: PublicationState.PUBLISHED,
    scheduledPublishAt: null,
    publishedAt: new Date('2026-06-25T08:00:00.000Z'),
    unpublishedAt: null,
    certificateConfigs: [],
    majorEventPrices: [],
  };
}
