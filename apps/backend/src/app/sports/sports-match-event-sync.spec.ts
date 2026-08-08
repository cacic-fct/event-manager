import type { Prisma } from '@prisma/client';
import { sportsMatchRecord } from './testing/sports-backend.fixtures';
import { syncSportsMatchEventName } from './sports-match-event-sync';

describe('syncSportsMatchEventName', () => {
  it('updates the linked event with both assigned team names', async () => {
    const tx = {
      sportsMatch: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(sportsMatchRecord({
          category: { name: 'Futsal' },
          homeRegistration: { team: { name: 'Equipe A' } },
          awayRegistration: { team: { name: 'Equipe B' } },
        })),
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
        findUniqueOrThrow: jest.fn().mockResolvedValue(sportsMatchRecord({
          eventId: 'event-2',
          category: { name: 'Vôlei' },
          homeRegistration: null,
          awayRegistration: null,
        })),
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
