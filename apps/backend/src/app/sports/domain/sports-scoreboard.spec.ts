import {
  applySportsScoreDelta,
  closeActiveSportsScorePeriod,
  normalizeSportsScoreboard,
  rollSportsScorePeriod,
} from './sports-scoreboard';

describe('sports scoreboard', () => {
  it('normalizes an absent scoreboard to a safe empty value', () => {
    expect(normalizeSportsScoreboard(null)).toEqual({
      home: 0,
      away: 0,
      periods: [],
      activePeriodNumber: null,
    });
  });

  it('sorts periods while preserving decimal scores', () => {
    expect(
      normalizeSportsScoreboard({
        home: 1.5,
        away: 0.5,
        activePeriodNumber: 2,
        periods: [
          { number: 2, label: 'Rodada 2', home: 1, away: 0, closed: false },
          { number: 1, label: 'Rodada 1', home: 0.5, away: 0.5, closed: true },
        ],
      }),
    ).toEqual({
      home: 1.5,
      away: 0.5,
      activePeriodNumber: 2,
      periods: [
        { number: 1, label: 'Rodada 1', home: 0.5, away: 0.5, closed: true },
        { number: 2, label: 'Rodada 2', home: 1, away: 0, closed: false },
      ],
    });
  });

  it('applies live deltas to the total and active period without mutating the source', () => {
    const original = rollSportsScorePeriod(normalizeSportsScoreboard(null), { label: 'Set' });
    const updated = applySportsScoreDelta(original, { side: 'AWAY', amount: 1 });

    expect(updated).toMatchObject({
      home: 0,
      away: 1,
      activePeriodNumber: 1,
      periods: [{ number: 1, label: 'Set 1', home: 0, away: 1, closed: false }],
    });
    expect(original.away).toBe(0);
    expect(original.periods[0].away).toBe(0);
  });

  it('supports negative correction deltas but never permits a negative result', () => {
    const scoreboard = normalizeSportsScoreboard({ home: 3, away: 1 });

    expect(applySportsScoreDelta(scoreboard, { side: 'HOME', amount: -1 }).home).toBe(2);
    expect(() => applySportsScoreDelta(scoreboard, { side: 'AWAY', amount: -2 })).toThrow(
      'cannot be negative',
    );
  });

  it('rolls and closes periods while enforcing the configured maximum', () => {
    const first = rollSportsScorePeriod(normalizeSportsScoreboard(null), {
      label: 'Tempo',
      maximumPeriods: 2,
    });
    const second = rollSportsScorePeriod(first, {
      label: 'Tempo',
      maximumPeriods: 2,
    });

    expect(second.periods).toEqual([
      { number: 1, label: 'Tempo 1', home: 0, away: 0, closed: true },
      { number: 2, label: 'Tempo 2', home: 0, away: 0, closed: false },
    ]);
    expect(closeActiveSportsScorePeriod(second).activePeriodNumber).toBeNull();
    expect(() =>
      rollSportsScorePeriod(second, { label: 'Tempo', maximumPeriods: 2 }),
    ).toThrow('O máximo configurado de 2 períodos foi atingido.');
  });

  it('rejects drifted scoreboards with ambiguous open periods', () => {
    expect(() =>
      normalizeSportsScoreboard({
        home: 0,
        away: 0,
        activePeriodNumber: 1,
        periods: [
          { number: 1, label: 'Set 1', home: 0, away: 0, closed: false },
          { number: 2, label: 'Set 2', home: 0, away: 0, closed: false },
        ],
      }),
    ).toThrow('Only one score period can be open at a time.');
  });

  it('does not allow live deltas to rewrite a closed period', () => {
    const scoreboard = normalizeSportsScoreboard({
      home: 1,
      away: 0,
      activePeriodNumber: null,
      periods: [{ number: 1, label: 'Set 1', home: 1, away: 0, closed: true }],
    });

    expect(() =>
      applySportsScoreDelta(scoreboard, { side: 'HOME', amount: 1, periodNumber: 1 }),
    ).toThrow('Períodos encerrados não podem receber alterações de placar.');
  });
});
