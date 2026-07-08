import { NotFoundException } from '@nestjs/common';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PublicationState } from '@prisma/client';
import { PublicationTargetService } from './publishing-target.service';

describe('PublicationTargetService', () => {
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
    const service = new PublicationTargetService(prisma as never);

    return { prisma, service };
  }

  it('does not resolve the target event itself unless explicitly requested', async () => {
    const { prisma, service } = createService();

    await expect(service.resolveChildEventIds(PublicationTargetType.EVENT, 'event-1')).resolves.toEqual([]);

    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('returns the target event when event inclusion is requested', async () => {
    const { prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });

    await expect(
      service.resolveChildEventIds(PublicationTargetType.EVENT, 'event-1', { includeTargetEvent: true }),
    ).resolves.toEqual(['event-1']);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { id: 'event-1', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('throws when the requested target event does not exist', async () => {
    const { prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveChildEventIds(PublicationTargetType.EVENT, 'missing-event', { includeTargetEvent: true }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('resolves active major-event children and can filter to unpublished children', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]);

    await expect(
      service.resolveChildEventIds(PublicationTargetType.MAJOR_EVENT, 'major-1', { onlyMissingPublication: true }),
    ).resolves.toEqual(['event-1', 'event-2']);

    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'major-1', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        majorEventId: 'major-1',
        publicationState: { not: PublicationState.PUBLISHED },
      },
      select: { id: true },
      orderBy: { startDate: 'asc' },
    });
  });

  it('throws before loading children when the major event does not exist', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveChildEventIds(PublicationTargetType.MAJOR_EVENT, 'missing-major'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('resolves active event-group children with the event-group filter', async () => {
    const { prisma, service } = createService();
    prisma.eventGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);

    await expect(service.resolveChildEventIds(PublicationTargetType.EVENT_GROUP, 'group-1')).resolves.toEqual([
      'event-1',
    ]);

    expect(prisma.eventGroup.findFirst).toHaveBeenCalledWith({
      where: { id: 'group-1', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        eventGroupId: 'group-1',
      },
      select: { id: true },
      orderBy: { startDate: 'asc' },
    });
  });

  it('throws when an event group is required to have active events but has none', async () => {
    const { prisma, service } = createService();
    prisma.eventGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.event.findMany.mockResolvedValue([]);

    await expect(
      service.resolveChildEventIds(PublicationTargetType.EVENT_GROUP, 'group-1', { requireChildren: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows an existing major event or event group to have no active children when not required', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    prisma.eventGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.event.findMany.mockResolvedValue([]);

    await expect(service.resolveChildEventIds(PublicationTargetType.MAJOR_EVENT, 'major-1')).resolves.toEqual([]);
    await expect(service.resolveChildEventIds(PublicationTargetType.EVENT_GROUP, 'group-1')).resolves.toEqual([]);
  });

  it('throws before loading children when the event group does not exist', async () => {
    const { prisma, service } = createService();
    prisma.eventGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveChildEventIds(PublicationTargetType.EVENT_GROUP, 'missing-group'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });
});
