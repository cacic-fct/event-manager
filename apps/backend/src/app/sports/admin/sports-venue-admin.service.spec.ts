import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { sportsAdminVenueRecord } from '../testing/sports-backend.fixtures';
import { SportsVenueAdminService } from './sports-venue-admin.service';

describe('SportsVenueAdminService', () => {
  const actor = { sub: 'admin-1', token: 'token', permissionSet: new Set<string>() } as never;
  const frozen = { assertMajorEventMutable: jest.fn().mockResolvedValue(undefined) };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const payments = {};
  let tx: ReturnType<typeof createTransaction>;
  let prisma: ReturnType<typeof createPrisma>;
  let service: SportsVenueAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = createPrisma(tx);
    service = new SportsVenueAdminService(prisma as never, frozen as never, auditLog as never, payments as never);
  });

  describe('createVenue', () => {
    it('creates and audits a trimmed venue after authorizing its major event', async () => {
      const venue = sportsAdminVenueRecord();
      prisma.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
      tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
      tx.placePreset.findFirst.mockResolvedValue({ id: 'place-1' });
      tx.sportsVenue.create.mockResolvedValue(venue);

      await expect(
        service.createVenue(
          {
            tournamentId: 'tournament-1',
            placePresetId: 'place-1',
            name: '  Ginásio Universitário  ',
            courtLabel: '  Quadra principal  ',
            capacity: 420,
            notes: '  Entrada lateral  ',
          },
          actor,
        ),
      ).resolves.toEqual(venue);

      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'edit');
      expect(tx.sportsVenue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tournamentId: 'tournament-1',
          placePresetId: 'place-1',
          name: 'Ginásio Universitário',
          courtLabel: 'Quadra principal',
          capacity: 420,
          notes: 'Entrada lateral',
          createdById: 'admin-1',
          updatedById: 'admin-1',
        }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: 'venue-1',
          operation: AuditLogOperation.CREATE,
          actor,
        }),
        tx,
      );
    });

    it.each([-1, 2.5])('rejects invalid capacity %s before database or authorization work', async (capacity) => {
      await expect(
        service.createVenue(
          { tournamentId: 'tournament-1', placePresetId: 'place-1', name: 'Ginásio', capacity },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.sportsTournament.findFirst).not.toHaveBeenCalled();
      expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();
    });

    it('rejects a missing tournament before entering the transaction', async () => {
      prisma.sportsTournament.findFirst.mockResolvedValue(null);

      await expect(
        service.createVenue({ tournamentId: 'missing', placePresetId: 'place-1', name: 'Ginásio' }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a parent venue outside the tournament', async () => {
      prisma.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
      tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
      tx.placePreset.findFirst.mockResolvedValue({ id: 'place-1' });
      tx.sportsVenue.findFirst.mockResolvedValue(null);

      await expect(
        service.createVenue(
          {
            tournamentId: 'tournament-1',
            placePresetId: 'place-1',
            name: 'Quadra auxiliar',
            parentVenueId: 'venue-other-tournament',
          },
          actor,
        ),
      ).rejects.toThrow('O local pai não pertence ao torneio.');

      expect(tx.sportsVenue.create).not.toHaveBeenCalled();
    });

    it('rejects when the tournament or backing place disappears inside the transaction', async () => {
      prisma.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
      tx.sportsTournament.findFirst.mockResolvedValue(null);
      tx.placePreset.findFirst.mockResolvedValue({ id: 'place-1' });

      await expect(
        service.createVenue({ tournamentId: 'tournament-1', placePresetId: 'place-1', name: 'Ginásio' }, actor),
      ).rejects.toThrow('Torneio ou local não encontrado.');
    });
  });

  describe('updateVenue', () => {
    it('rejects an unknown venue before authorization', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(null);

      await expect(
        service.updateVenue('missing', { tournamentId: 'tournament-1', expectedRevision: 1 }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();
    });

    it('updates the venue and synchronizes all backing match events', async () => {
      const existing = sportsAdminVenueRecord();
      const updated = sportsAdminVenueRecord({
        name: 'Ginásio Renovado',
        courtLabel: 'Quadra 2',
        revision: 4,
      });
      prisma.sportsVenue.findFirst.mockResolvedValue(existing);
      tx.placePreset.findFirst.mockResolvedValue({ id: 'place-1' });
      tx.sportsVenue.updateMany.mockResolvedValue({ count: 1 });
      tx.sportsVenue.findUniqueOrThrow.mockResolvedValue(updated);

      await expect(
        service.updateVenue(
          'venue-1',
          {
            tournamentId: 'tournament-1',
            expectedRevision: 3,
            name: '  Ginásio Renovado ',
            courtLabel: ' Quadra 2 ',
            placePresetId: 'place-1',
          },
          actor,
        ),
      ).resolves.toEqual(updated);

      expect(tx.event.updateMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          sportsMatch: { is: { venueId: 'venue-1', deletedAt: null } },
        },
        data: {
          latitude: -22.12,
          longitude: -51.4,
          locationDescription: 'Campus universitário · Ginásio Renovado · Quadra 2',
          updatedById: 'admin-1',
        },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.UPDATE, before: existing, after: updated }),
        tx,
      );
    });

    it('rejects changing a venue through a different tournament scope', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());

      await expect(
        service.updateVenue('venue-1', { tournamentId: 'tournament-other', expectedRevision: 3 }, actor),
      ).rejects.toThrow('O local não pertence ao torneio informado.');

      expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();
    });

    it('rejects self-parenting without mutating the venue', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());

      await expect(
        service.updateVenue(
          'venue-1',
          { tournamentId: 'tournament-1', expectedRevision: 3, parentVenueId: 'venue-1' },
          actor,
        ),
      ).rejects.toThrow('Um local não pode ser pai dele mesmo.');

      expect(tx.sportsVenue.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an indirect parent cycle', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());
      tx.sportsVenue.findFirst
        .mockResolvedValueOnce({ id: 'venue-child', parentVenueId: 'venue-grandchild' })
        .mockResolvedValueOnce({ parentVenueId: 'venue-1' });

      await expect(
        service.updateVenue(
          'venue-1',
          { tournamentId: 'tournament-1', expectedRevision: 3, parentVenueId: 'venue-child' },
          actor,
        ),
      ).rejects.toThrow('A hierarquia de locais não pode conter ciclos.');
    });

    it('reports optimistic concurrency conflicts without auditing', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());
      tx.sportsVenue.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateVenue(
          'venue-1',
          { tournamentId: 'tournament-1', expectedRevision: 2, notes: 'Atualização concorrente' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it.each([
      [{ placePresetId: 'place-missing' }, 'Local base não encontrado.'],
      [{ parentVenueId: 'venue-missing' }, 'O local pai não pertence ao torneio.'],
      [{ capacity: -1 }, 'A capacidade deve ser um número inteiro não negativo.'],
    ])('rejects invalid backing-resource update %o', async (input, message) => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());
      tx.placePreset.findFirst.mockResolvedValue(null);
      tx.sportsVenue.findFirst.mockResolvedValue(null);

      await expect(
        service.updateVenue('venue-1', { tournamentId: 'tournament-1', expectedRevision: 3, ...input }, actor),
      ).rejects.toThrow(message);

      expect(tx.sportsVenue.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteVenue', () => {
    it('blocks deletion while a non-terminal match uses the venue', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());
      tx.sportsMatch.findFirst.mockResolvedValue({ id: 'match-live' });
      tx.sportsVenue.findFirst.mockResolvedValue(null);

      await expect(service.deleteVenue('venue-1', 3, actor, 'tournament-1')).rejects.toThrow(
        'O local possui uma partida em aberto. Altere a partida primeiro.',
      );

      expect(tx.sportsVenue.updateMany).not.toHaveBeenCalled();
    });

    it('blocks deletion while active child venues exist', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());
      tx.sportsMatch.findFirst.mockResolvedValue(null);
      tx.sportsVenue.findFirst.mockResolvedValue({ id: 'venue-child' });

      await expect(service.deleteVenue('venue-1', 3, actor, 'tournament-1')).rejects.toThrow(
        'O local possui subdivisões ativas. Remova ou mova-as primeiro.',
      );
    });

    it('soft deletes and force-audits an unused venue', async () => {
      const venue = sportsAdminVenueRecord();
      prisma.sportsVenue.findFirst.mockResolvedValue(venue);
      tx.sportsMatch.findFirst.mockResolvedValue(null);
      tx.sportsVenue.findFirst.mockResolvedValue(null);
      tx.sportsVenue.updateMany.mockResolvedValue({ count: 1 });

      await service.deleteVenue('venue-1', 3, actor, 'tournament-1');

      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'delete');
      expect(tx.sportsVenue.updateMany).toHaveBeenCalledWith({
        where: { id: 'venue-1', revision: 3, deletedAt: null },
        data: {
          deletedAt: expect.any(Date),
          revision: { increment: 1 },
          updatedById: 'admin-1',
        },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: AuditLogEntityType.SPORTS_VENUE,
          operation: AuditLogOperation.DELETE,
          before: venue,
          after: expect.objectContaining({ deletedAt: expect.any(Date) }),
          force: true,
        }),
        tx,
      );
    });

    it('rejects missing and cross-tournament delete targets before authorization', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(sportsAdminVenueRecord());

      await expect(service.deleteVenue('missing', 1, actor, 'tournament-1')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteVenue('venue-1', 3, actor, 'tournament-other')).rejects.toThrow(
        'O local não pertence ao torneio informado.',
      );
      expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();
    });

    it('reports a delete revision conflict without emitting an audit record', async () => {
      prisma.sportsVenue.findFirst.mockResolvedValue(sportsAdminVenueRecord());
      tx.sportsMatch.findFirst.mockResolvedValue(null);
      tx.sportsVenue.findFirst.mockResolvedValue(null);
      tx.sportsVenue.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.deleteVenue('venue-1', 2, actor, 'tournament-1')).rejects.toThrow(
        'O local mudou. Recarregue e tente novamente.',
      );
      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });
});

function createPrisma(tx: ReturnType<typeof createTransaction>) {
  return {
    $transaction: jest.fn((callback: (transaction: ReturnType<typeof createTransaction>) => Promise<unknown>) =>
      callback(tx),
    ),
    sportsTournament: { findFirst: jest.fn() },
    sportsVenue: { findFirst: jest.fn() },
  };
}

function createTransaction() {
  return {
    sportsTournament: { findFirst: jest.fn() },
    placePreset: { findFirst: jest.fn() },
    sportsVenue: {
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    sportsMatch: { findFirst: jest.fn() },
    event: { updateMany: jest.fn() },
  };
}
