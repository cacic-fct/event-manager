import { BadRequestException, ConflictException } from '@nestjs/common';
import { SportsMatchActionType, SportsMatchState } from '@prisma/client';
import {
  sportsMatchProjectionContext,
  sportsProjectedOutcome,
  sportsTestDate,
} from '../testing/sports-backend.fixtures';
import { SportsMatchOperationCommandValidation } from './sports-match-operation-command-validation';

class TestCommandValidation extends SportsMatchOperationCommandValidation {
  validate(
    type: SportsMatchActionType,
    payload: unknown,
    state: SportsMatchState,
    kind: 'ADMIN' | 'OFFICIAL' | 'LINEUP_MANAGER' = 'OFFICIAL',
    overrides: Record<string, unknown> = {},
  ) {
    const base = sportsMatchProjectionContext();
    const category = { ...(base['category'] as Record<string, unknown>) };
    if ('periodsEnabled' in overrides) {
      category['periodsEnabled'] = overrides['periodsEnabled'];
    }
    return this.validateCommand(
      type,
      payload as never,
      sportsProjectedOutcome({ state }) as never,
      sportsMatchProjectionContext({ ...overrides, category }) as never,
      kind,
    );
  }
}

describe('SportsMatchOperationCommandValidation', () => {
  const service = new TestCommandValidation(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('accepts a valid live score delta', () => {
    expect(() =>
      service.validate(SportsMatchActionType.SCORE_DELTA, { side: 'HOME', amount: 1 }, SportsMatchState.LIVE),
    ).not.toThrow();
  });

  it.each([SportsMatchActionType.SCORE_DELTA, SportsMatchActionType.PERIOD_ROLL])(
    'requires a live or paused match for score operations',
    (type) => {
      expect(() => service.validate(type, {}, SportsMatchState.SCHEDULED)).toThrow(ConflictException);
    },
  );

  it.each([
    [{ occurrenceId: '', kind: 'CARD' }, 'Informe um identificador válido para a ocorrência.'],
    [{ occurrenceId: 'x'.repeat(101), kind: 'CARD' }, 'Informe um identificador válido para a ocorrência.'],
    [{ occurrenceId: 'occurrence-1', kind: '' }, 'Informe o tipo da ocorrência.'],
    [{ occurrenceId: 'occurrence-1', kind: 'x'.repeat(81) }, 'Informe o tipo da ocorrência.'],
    [
      { occurrenceId: 'occurrence-1', kind: 'CARD', note: 'x'.repeat(1001) },
      'A observação da ocorrência deve ter no máximo 1000 caracteres.',
    ],
  ])('validates occurrence identifiers, kinds, and notes', (payload, message) => {
    expect(() => service.validate(SportsMatchActionType.OCCURRENCE, payload, SportsMatchState.LIVE)).toThrow(message);
  });

  it('accepts a bounded occurrence', () => {
    expect(() =>
      service.validate(
        SportsMatchActionType.OCCURRENCE,
        { occurrenceId: 'occ-1', kind: 'CARD', note: 'Aviso' },
        SportsMatchState.LIVE,
      ),
    ).not.toThrow();
  });

  it('restricts stopwatch reconciliation to officials or admins during an active match', () => {
    expect(() =>
      service.validate(SportsMatchActionType.TIMER_RECONCILE, {}, SportsMatchState.LIVE, 'LINEUP_MANAGER'),
    ).toThrow(BadRequestException);
    expect(() => service.validate(SportsMatchActionType.TIMER_RECONCILE, {}, SportsMatchState.SCHEDULED)).toThrow(
      ConflictException,
    );
  });

  it('validates a device timer reconciliation through the projector contract', () => {
    const startedAtUnixMs = sportsTestDate(-60_000).getTime();
    expect(() =>
      service.validate(
        SportsMatchActionType.TIMER_RECONCILE,
        {
          resolution: 'DEVICE',
          state: SportsMatchState.LIVE,
          overall: { startedAtUnixMs, pausedAtUnixMs: null, elapsedBeforePauseMs: 60_000 },
          periods: [],
        },
        SportsMatchState.LIVE,
      ),
    ).not.toThrow();
  });

  it('rejects period rolls for categories without periods', () => {
    expect(() =>
      service.validate(SportsMatchActionType.PERIOD_ROLL, {}, SportsMatchState.LIVE, 'OFFICIAL', {
        periodsEnabled: false,
      }),
    ).toThrow('Esta modalidade não utiliza períodos ou sets.');
  });

  it('allows only admins to correct a non-active final scoreboard', () => {
    expect(() =>
      service.validate(SportsMatchActionType.SCORE_CORRECTION, { scoreboard: {} }, SportsMatchState.FINISHED),
    ).toThrow(ConflictException);
    expect(() =>
      service.validate(SportsMatchActionType.SCORE_CORRECTION, { scoreboard: {} }, SportsMatchState.FINISHED, 'ADMIN'),
    ).not.toThrow();
  });

  it.each([
    [SportsMatchActionType.START, SportsMatchState.LIVE, 'A partida não pode ser iniciada neste estado.'],
    [SportsMatchActionType.PAUSE, SportsMatchState.PAUSED, 'Somente uma partida ao vivo pode ser pausada.'],
    [SportsMatchActionType.RESUME, SportsMatchState.LIVE, 'Somente uma partida pausada pode ser retomada.'],
    [SportsMatchActionType.CANCEL, SportsMatchState.FINISHED, 'A partida não pode ser cancelada neste estado.'],
  ])('enforces action state transitions', (type, state, message) => {
    expect(() => service.validate(type, {}, state)).toThrow(message);
  });

  it('requires both registrations before starting', () => {
    expect(() =>
      service.validate(SportsMatchActionType.START, {}, SportsMatchState.SCHEDULED, 'OFFICIAL', {
        awayRegistrationId: null,
      }),
    ).toThrow('Defina as duas equipes antes de iniciar a partida.');
  });

  it('blocks a normal start when readiness has actionable blockers', () => {
    expect(() =>
      service.validate(SportsMatchActionType.START, {}, SportsMatchState.SCHEDULED, 'OFFICIAL', {
        readiness: {
          ready: false,
          issues: [
            {
              code: 'ATHLETE_ATTENDANCE',
              message: 'Faltam 2 atletas presentes',
              registrationId: 'registration-home',
              missing: 2,
              required: 5,
              actual: 3,
            },
          ],
        },
      }),
    ).toThrow('Faltam 2 atletas presentes');
  });

  it.each(['ADMIN', 'OFFICIAL'] as const)('allows an authorized %s actor to override readiness explicitly', (kind) => {
    expect(() =>
      service.validate(SportsMatchActionType.START, { readinessOverride: true }, SportsMatchState.SCHEDULED, kind, {
        readiness: {
          ready: false,
          issues: [
            {
              code: 'OFFICIAL_ATTENDANCE',
              message: 'Nenhum oficial foi designado para a partida.',
              registrationId: null,
              missing: 1,
              required: 1,
              actual: 0,
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it('rejects a readiness override from a lineup manager or with an invalid flag', () => {
    expect(() =>
      service.validate(SportsMatchActionType.START, { readinessOverride: true }, SportsMatchState.SCHEDULED, 'LINEUP_MANAGER', {
        readiness: { ready: true, issues: [] },
      }),
    ).toThrow('Somente a arbitragem ou administradores podem substituir a prontidão.');
    expect(() =>
      service.validate(SportsMatchActionType.START, { readinessOverride: 'yes' }, SportsMatchState.SCHEDULED, 'OFFICIAL'),
    ).toThrow('readinessOverride deve ser booleano.');
  });

  it('limits lineup-manager forfeits to pre-match states', () => {
    expect(() =>
      service.validate(SportsMatchActionType.FORFEIT, validOutcome(), SportsMatchState.LIVE, 'LINEUP_MANAGER'),
    ).toThrow('Capitães e técnicos só podem desistir antes do início da partida.');
  });

  it.each([
    [{ side: 'OTHER', amount: 1 }, 'Selecione o lado do placar.'],
    [{ side: 'HOME', amount: 0 }, 'A alteração de placar deve ser um número diferente de zero.'],
    [{ side: 'HOME', amount: Number.NaN }, 'A alteração de placar deve ser um número diferente de zero.'],
  ])('rejects invalid score deltas', (payload, message) => {
    expect(() => service.validate(SportsMatchActionType.SCORE_DELTA, payload, SportsMatchState.LIVE)).toThrow(message);
  });

  it('wraps malformed scoreboard corrections as client errors', () => {
    expect(() =>
      service.validate(SportsMatchActionType.SCORE_CORRECTION, { scoreboard: 'invalid' }, SportsMatchState.LIVE),
    ).toThrow(BadRequestException);
  });

  it('validates an explicit stopwatch snapshot during score correction', () => {
    expect(() =>
      service.validate(
        SportsMatchActionType.SCORE_CORRECTION,
        {
          scoreboard: { home: 1, away: 0, activePeriodNumber: null, periods: [] },
          stopwatch: {
            state: SportsMatchState.LIVE,
            activePeriod: null,
            overall: { startedAtUnixMs: null, pausedAtUnixMs: null, elapsedBeforePauseMs: 0 },
            periods: [],
          },
        },
        SportsMatchState.LIVE,
      ),
    ).not.toThrow();
  });

  it.each([SportsMatchActionType.RESET, SportsMatchActionType.RESCHEDULE])(
    'restricts administrative reset and reschedule operations',
    (type) => {
      expect(() => service.validate(type, {}, SportsMatchState.SCHEDULED)).toThrow(
        'Somente administradores podem redefinir ou reagendar a partida.',
      );
    },
  );

  it('validates reschedule dates for administrators', () => {
    expect(() =>
      service.validate(
        SportsMatchActionType.RESCHEDULE,
        { startDate: sportsTestDate(60_000).toISOString(), endDate: sportsTestDate(120_000).toISOString() },
        SportsMatchState.SCHEDULED,
        'ADMIN',
      ),
    ).not.toThrow();
    expect(() => service.validate(SportsMatchActionType.RESCHEDULE, {}, SportsMatchState.SCHEDULED, 'ADMIN')).toThrow(
      BadRequestException,
    );
  });

  it('rejects inconsistent draw and winner outcomes', () => {
    expect(() =>
      service.validate(
        SportsMatchActionType.FINALIZE,
        { draw: true, winnerRegistrationId: 'home' },
        SportsMatchState.LIVE,
      ),
    ).toThrow('Um empate não pode possuir vencedor ou perdedor.');
    expect(() =>
      service.validate(
        SportsMatchActionType.FINALIZE,
        { winnerRegistrationId: 'home', loserRegistrationId: 'home' },
        SportsMatchState.LIVE,
      ),
    ).toThrow('Revise as equipes vencedora e perdedora.');
  });

  it('rejects finalization from a terminal state and requires a loss reason', () => {
    expect(() => service.validate(SportsMatchActionType.FINALIZE, validOutcome(), SportsMatchState.FINISHED)).toThrow(
      'A partida não pode ser finalizada neste estado.',
    );
    expect(() =>
      service.validate(
        SportsMatchActionType.FINALIZE,
        { winnerRegistrationId: 'registration-home', loserRegistrationId: 'registration-away' },
        SportsMatchState.LIVE,
      ),
    ).toThrow('Informe o motivo da derrota.');
  });

  it('accepts rule-compatible draw and winner outcomes', () => {
    expect(() =>
      service.validate(
        SportsMatchActionType.FINALIZE,
        { draw: true, scoreboard: { home: 1, away: 1, periods: [] } },
        SportsMatchState.LIVE,
      ),
    ).not.toThrow();
    expect(() => service.validate(SportsMatchActionType.FINALIZE, validOutcome(), SportsMatchState.LIVE)).not.toThrow();
  });
});

function validOutcome() {
  return { winnerRegistrationId: 'registration-home', loserRegistrationId: 'registration-away', lossReason: 'SCORE' };
}
