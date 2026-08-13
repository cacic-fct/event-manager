import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SportsScoreEntrySource } from '@prisma/client';
import {
  sportsAdminBackingEventRecord,
  sportsAdminVenueRecord,
  sportsTestDate,
} from '../testing/sports-backend.fixtures';
import { SportsAdminBaseService } from './sports-admin-base.service';

class TestSportsAdminBaseService extends SportsAdminBaseService {
  attach(tx: ReturnType<typeof createTransaction>, eventId: string, scope: Record<string, unknown>) {
    return this.attachCompatibleEvent(tx as never, eventId, scope as never, 'admin-1');
  }
  venueChain(tx: ReturnType<typeof createTransaction>, venueId: string, parentId: string) {
    return this.assertVenueParentChain(tx as never, venueId, parentId, 'tournament-1');
  }
  registrationForm(tx: ReturnType<typeof createTransaction>, formId: string | null) {
    return this.assertRegistrationFormForMajorEvent(tx as never, formId, 'major-event-1');
  }
  manualScore(input: { source: SportsScoreEntrySource; points: number; sourceMatchId?: string | null }) {
    return this.assertManualScoreEntry(input);
  }
  officialScope(scope: { majorEventId: string; eventGroupId: string | null; eventId: string | null }) {
    return this.assertOfficialScopeMutable(scope, actor, 'edit');
  }
  formData(category: Record<string, unknown>, answers: Prisma.InputJsonValue | null | undefined) {
    return this.buildRegistrationFormData(category as never, answers);
  }
  updateAnswers(snapshot: Prisma.JsonValue | null, answers: Prisma.InputJsonValue | null) {
    return this.normalizeRegistrationUpdateAnswers(snapshot, answers);
  }
  formElements(value: Prisma.JsonValue | undefined) {
    return this.readFormElements(value, 'Estrutura inválida.');
  }
  scoreTargets(tx: ReturnType<typeof createTransaction>, teamId: string, categoryId?: string | null) {
    return this.assertScoreEntryTargets(tx as never, 'tournament-1', teamId, categoryId);
  }
  advancement(
    tx: ReturnType<typeof createTransaction>,
    sourceMatchId: string | null,
    targets: Array<string | null | undefined>,
  ) {
    return this.assertAdvancementTargets(tx as never, 'category-1', sourceMatchId, targets);
  }
}

const actor = { sub: 'admin-1', token: 'token', permissionSet: new Set<string>() } as never;

describe('SportsAdminBaseService', () => {
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  let tx: ReturnType<typeof createTransaction>;
  let service: TestSportsAdminBaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    service = new TestSportsAdminBaseService({} as never, frozen as never, {} as never, {} as never);
  });

  describe('backing event attachment', () => {
    it('converts a compatible event and synchronizes venue coordinates', async () => {
      const event = sportsAdminBackingEventRecord();
      const venue = sportsAdminVenueRecord();
      tx.event.findFirst.mockResolvedValue(event);
      tx.event.update.mockResolvedValue({ ...event, shouldCollectAttendance: true });

      await service.attach(tx, 'event-1', {
        majorEventId: 'major-event-1',
        eventGroupId: 'event-group-1',
        name: ' Final universitária ',
        startDate: sportsTestDate(3 * 60 * 60_000),
        endDate: sportsTestDate(4 * 60 * 60_000),
        venue,
      });

      expect(tx.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: {
          name: 'Final universitária',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          shouldCollectAttendance: true,
          allowSubscription: false,
          latitude: -22.12,
          longitude: -51.4,
          locationDescription: 'Campus universitário · Ginásio Universitário · Quadra principal',
          updatedById: 'admin-1',
        },
      });
    });

    it.each([
      [null, NotFoundException, 'Event event-1 was not found.'],
      [sportsAdminBackingEventRecord({ majorEventId: 'major-other' }), BadRequestException, 'mesmo grande evento'],
      [
        sportsAdminBackingEventRecord({ sportsMatch: { id: 'match-existing' } }),
        ConflictException,
        'já está vinculado',
      ],
      [sportsAdminBackingEventRecord({ allowSubscription: true }), ConflictException, 'inscrições próprias'],
    ])('rejects an incompatible backing event %#', async (event, errorType, message) => {
      tx.event.findFirst.mockResolvedValue(event);
      const operation = service.attach(tx, 'event-1', {
        majorEventId: 'major-event-1',
        eventGroupId: 'event-group-1',
        venue: null,
      });
      await expect(operation).rejects.toBeInstanceOf(errorType);
      await expect(operation).rejects.toThrow(message);
    });
  });

  describe('venue hierarchy and registration form ownership', () => {
    it('walks a valid parent chain and rejects cycles or missing ancestors', async () => {
      tx.sportsVenue.findFirst
        .mockResolvedValueOnce({ parentVenueId: 'venue-root' })
        .mockResolvedValueOnce({ parentVenueId: null });
      await expect(service.venueChain(tx, 'venue-1', 'venue-parent')).resolves.toBeUndefined();

      tx.sportsVenue.findFirst.mockReset().mockResolvedValueOnce({ parentVenueId: 'venue-1' });
      await expect(service.venueChain(tx, 'venue-1', 'venue-parent')).rejects.toThrow('não pode conter ciclos');

      tx.sportsVenue.findFirst.mockReset().mockResolvedValue(null);
      await expect(service.venueChain(tx, 'venue-1', 'venue-missing')).rejects.toThrow('local inválido');
    });

    it('accepts omitted or owned forms and rejects forms outside the major event', async () => {
      await expect(service.registrationForm(tx, null)).resolves.toBeUndefined();
      tx.eventForm.findFirst.mockResolvedValueOnce({ id: 'form-1' }).mockResolvedValueOnce(null);
      await expect(service.registrationForm(tx, 'form-1')).resolves.toBeUndefined();
      await expect(service.registrationForm(tx, 'form-other')).rejects.toThrow('precisa pertencer ao grande evento');
    });
  });

  it('validates manual administrative score entries', () => {
    expect(() => service.manualScore({ source: SportsScoreEntrySource.MANUAL, points: 3 })).not.toThrow();
    expect(() => service.manualScore({ source: SportsScoreEntrySource.PENALTY, points: -2 })).not.toThrow();
    expect(() => service.manualScore({ source: SportsScoreEntrySource.MATCH, points: 3 })).toThrow(
      'manuais ou penalidades',
    );
    expect(() =>
      service.manualScore({ source: SportsScoreEntrySource.MANUAL, points: 3, sourceMatchId: 'match-1' }),
    ).toThrow('não podem se passar por pontuação de partida');
    expect(() => service.manualScore({ source: SportsScoreEntrySource.MANUAL, points: 1.5 })).toThrow('número inteiro');
  });

  it('dispatches official mutability to event, group, or major event scope', async () => {
    await service.officialScope({ majorEventId: 'major-1', eventGroupId: 'group-1', eventId: 'event-1' });
    await service.officialScope({ majorEventId: 'major-1', eventGroupId: 'group-1', eventId: null });
    await service.officialScope({ majorEventId: 'major-1', eventGroupId: null, eventId: null });
    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', actor, 'edit');
    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-1', actor, 'edit');
  });

  describe('registration form snapshots', () => {
    const elements = [{ id: 'student-id', type: 'shortText', title: 'Matrícula', required: true }];
    const form = {
      id: 'form-1',
      name: 'Dados esportivos',
      elements,
      updatedAt: sportsTestDate(-60_000),
      deletedAt: null,
    };

    it('returns no payload without a configured form and rejects submitted answers', () => {
      expect(service.formData({ registrationFormId: null, registrationForm: null }, undefined)).toEqual({});
      expect(() => service.formData({ registrationFormId: null, registrationForm: null }, [])).toThrow(
        'não possui formulário',
      );
    });

    it('normalizes answers and captures the immutable form schema', () => {
      const result = service.formData({ registrationFormId: 'form-1', registrationForm: form }, [
        { elementId: 'student-id', value: ' 12345 ' },
      ]);
      expect(result.formAnswers).toEqual([{ elementId: 'student-id', value: '12345' }]);
      expect(result.formSchemaSnapshot).toEqual(
        expect.objectContaining({
          version: 1,
          formId: 'form-1',
          name: 'Dados esportivos',
          elements,
          capturedAt: expect.any(String),
          sourceUpdatedAt: form.updatedAt.toISOString(),
        }),
      );
    });

    it('rejects unavailable and structurally invalid forms', () => {
      expect(() => service.formData({ registrationFormId: 'form-1', registrationForm: null }, [])).toThrow(
        'não está disponível',
      );
      expect(() =>
        service.formData({ registrationFormId: 'form-1', registrationForm: { ...form, elements: {} } }, []),
      ).toThrow('estrutura inválida');
    });

    it('normalizes updates against snapshots and rejects invalid snapshots', () => {
      expect(service.updateAnswers(null, null)).toBe(Prisma.JsonNull);
      expect(service.updateAnswers({ elements } as never, [{ elementId: 'student-id', value: ' 54321 ' }])).toEqual([
        { elementId: 'student-id', value: '54321' },
      ]);
      expect(() => service.updateAnswers(null, [])).toThrow('não possui um retrato válido');
      expect(() => service.updateAnswers({ elements: {} }, [])).toThrow('retrato do formulário');
      expect(service.formElements(elements)).toEqual(elements);
      expect(() => service.formElements({})).toThrow('Estrutura inválida.');
    });
  });

  describe('score and bracket targets', () => {
    it('accepts valid team/category score targets and rejects either foreign target', async () => {
      tx.sportsTeam.findFirst.mockResolvedValue({ id: 'team-1' });
      tx.sportsCategory.findFirst.mockResolvedValue({ id: 'category-1' });
      await expect(service.scoreTargets(tx, 'team-1', 'category-1')).resolves.toBeUndefined();

      tx.sportsTeam.findFirst.mockResolvedValue(null);
      await expect(service.scoreTargets(tx, 'team-other', null)).rejects.toThrow('equipe não pertence');

      tx.sportsTeam.findFirst.mockResolvedValue({ id: 'team-1' });
      tx.sportsCategory.findFirst.mockResolvedValue(null);
      await expect(service.scoreTargets(tx, 'team-1', 'category-other')).rejects.toThrow('modalidade não pertence');
    });

    it('accepts empty/deduplicated advancement targets and rejects self or foreign targets', async () => {
      await expect(service.advancement(tx, null, [null, undefined])).resolves.toBeUndefined();
      await expect(service.advancement(tx, 'match-1', ['match-1'])).rejects.toThrow('para ela mesma');

      tx.sportsMatch.findMany.mockResolvedValue([{ id: 'match-2' }]);
      await expect(service.advancement(tx, null, ['match-2', 'match-3'])).rejects.toThrow('mesma modalidade');

      tx.sportsMatch.findMany.mockResolvedValue([{ id: 'match-2' }]);
      await expect(service.advancement(tx, null, ['match-2', 'match-2'])).resolves.toBeUndefined();
    });

    it('walks winner/loser advancement edges and rejects indirect cycles', async () => {
      tx.sportsMatch.findMany.mockResolvedValue([{ id: 'match-2' }]);
      tx.sportsMatch.findFirst
        .mockResolvedValueOnce({ winnerAdvancesToId: 'match-3', loserAdvancesToId: 'match-4' })
        .mockResolvedValueOnce({ winnerAdvancesToId: null, loserAdvancesToId: null })
        .mockResolvedValueOnce({ winnerAdvancesToId: null, loserAdvancesToId: null });
      await expect(service.advancement(tx, 'match-1', ['match-2'])).resolves.toBeUndefined();

      tx.sportsMatch.findFirst.mockReset().mockResolvedValueOnce({
        winnerAdvancesToId: 'match-1',
        loserAdvancesToId: null,
      });
      await expect(service.advancement(tx, 'match-1', ['match-2'])).rejects.toThrow('ciclo inválido');
    });

    it('terminates safely when an existing target graph repeats an already visited node', async () => {
      tx.sportsMatch.findMany.mockResolvedValue([{ id: 'match-2' }]);
      tx.sportsMatch.findFirst.mockResolvedValueOnce({
        winnerAdvancesToId: 'match-2',
        loserAdvancesToId: null,
      });

      await expect(service.advancement(tx, 'match-1', ['match-2'])).resolves.toBeUndefined();
      expect(tx.sportsMatch.findFirst).toHaveBeenCalledTimes(1);
    });
  });
});

function createTransaction() {
  return {
    event: { findFirst: jest.fn(), update: jest.fn() },
    sportsVenue: { findFirst: jest.fn() },
    eventForm: { findFirst: jest.fn() },
    sportsTeam: { findFirst: jest.fn() },
    sportsCategory: { findFirst: jest.fn() },
    sportsMatch: { findMany: jest.fn(), findFirst: jest.fn() },
  };
}
