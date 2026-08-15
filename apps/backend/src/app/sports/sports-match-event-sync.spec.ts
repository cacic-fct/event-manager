import { Prisma, PublicationState } from '@prisma/client';
import { sportsMatchRecord } from './testing/sports-backend.fixtures';
import {
  createSportsMatchBackingEvent,
  softDeleteSportsMatchBackingEvents,
  syncSportsMatchEventName,
  updateSportsMatchBackingEvent,
} from './sports-match-event-sync';

describe('sports match backing events', () => {
  it('creates an event with the shared sports invariants and venue projection', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event-1' });
    const tx = { event: { create } } as unknown as Prisma.TransactionClient;
    const startDate = new Date('2026-08-11T12:00:00.000Z');
    const endDate = new Date('2026-08-11T13:00:00.000Z');

    await createSportsMatchBackingEvent(tx, {
      name: 'Futsal — A x B',
      emoji: '⚽',
      startDate,
      endDate,
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      venue: {
        name: 'Ginásio',
        courtLabel: 'Quadra 1',
        placePreset: {
          latitude: -22,
          longitude: -43,
          locationDescription: 'Bloco A',
        },
      },
      isPubliclyListed: true,
      publicationState: PublicationState.PUBLISHED,
      publishedAt: startDate,
      actorId: 'actor-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Futsal — A x B',
        type: 'OTHER',
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
        latitude: -22,
        longitude: -43,
        locationDescription: 'Bloco A · Ginásio · Quadra 1',
        allowSubscription: false,
        shouldCollectAttendance: true,
        isPubliclyListed: true,
        publicationState: PublicationState.PUBLISHED,
      }),
    });
  });

  it('updates and deletes backing events through the common boundary', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { event: { update, updateMany } } as unknown as Prisma.TransactionClient;
    const startDate = new Date('2026-08-11T12:00:00.000Z');
    const endDate = new Date('2026-08-11T13:00:00.000Z');

    await updateSportsMatchBackingEvent(tx, 'event-1', {
      startDate,
      endDate,
      venue: null,
      venueChanged: true,
      livestreamChanged: true,
      youtubeCode: null,
      actorId: 'actor-1',
    });
    await softDeleteSportsMatchBackingEvents(tx, ['event-1', 'event-2'], endDate, 'actor-1');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: expect.objectContaining({
        startDate,
        endDate,
        latitude: null,
        longitude: null,
        locationDescription: null,
        youtubeCode: null,
        updatedById: 'actor-1',
      }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-1', 'event-2'] }, deletedAt: null },
      data: { deletedAt: endDate, updatedById: 'actor-1' },
    });
  });
});

describe('syncSportsMatchEventName', () => {
  it('updates the linked event with both assigned team names', async () => {
    const tx = {
      sportsMatch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(
          sportsMatchRecord({
            category: { name: 'Futsal' },
            homeRegistration: { team: { name: 'Equipe A' } },
            awayRegistration: { team: { name: 'Equipe B' } },
          }),
        ),
      },
      event: { update: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    await syncSportsMatchEventName(tx, 'match-1', 'actor-1');

    expect(tx.sportsMatch.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      select: {
        eventId: true,
        category: { select: { name: true } },
        homeRegistration: { select: { team: { select: { name: true } } } },
        awayRegistration: { select: { team: { select: { name: true } } } },
      },
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { name: 'Futsal — Equipe A x Equipe B', updatedById: 'actor-1' },
    });
  });

  it('uses the pending-team label for unassigned bracket positions', async () => {
    const tx = {
      sportsMatch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(
          sportsMatchRecord({
            eventId: 'event-2',
            category: { name: 'Vôlei' },
            homeRegistration: null,
            awayRegistration: null,
          }),
        ),
      },
      event: { update: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    await syncSportsMatchEventName(tx, 'match-2', 'actor-2');

    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-2' },
      data: { name: 'Vôlei — A definir x A definir', updatedById: 'actor-2' },
    });
  });
});
