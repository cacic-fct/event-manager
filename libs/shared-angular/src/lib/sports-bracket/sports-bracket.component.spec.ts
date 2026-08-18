import '@angular/compiler';
import { SPORTS_BRACKET_FIXTURES } from './sports-bracket.fixtures';
import { SportsBracketComponent } from './sports-bracket.component';
import { sportsBracketFormatLabel, sportsBracketMatchStateLabel } from './sports-bracket.models';

describe('sports bracket shared contract', () => {
  it('provides rich, deterministic examples for every supported format', () => {
    expect(Object.keys(SPORTS_BRACKET_FIXTURES)).toEqual([
      'SINGLE_ELIMINATION',
      'ROUND_ROBIN',
      'GROUP_STAGE_ELIMINATION',
      'DOUBLE_ELIMINATION',
      'SWISS',
      'CUSTOM',
    ]);
    expect(SPORTS_BRACKET_FIXTURES.SINGLE_ELIMINATION.stages[0]?.matches.length).toBeGreaterThan(8);
    expect(SPORTS_BRACKET_FIXTURES.DOUBLE_ELIMINATION.stages.length).toBeGreaterThan(1);
    expect(SPORTS_BRACKET_FIXTURES.SWISS.standings.length).toBeGreaterThan(8);
  });

  it('translates formats and match states instead of exposing enums', () => {
    expect(sportsBracketFormatLabel('GROUP_STAGE_ELIMINATION')).toBe('Grupos e eliminatórias');
    expect(sportsBracketMatchStateLabel('CANCELED')).toBe('Cancelada');
    expect(sportsBracketMatchStateLabel('AWAITING_REVIEW')).toBe('Em revisão');
    expect(sportsBracketMatchStateLabel('CHECK_IN')).toBe('Credenciamento');
  });
});

describe('SportsBracketComponent behavior', () => {
  const component = () => {
    const instance = Object.create(SportsBracketComponent.prototype) as SportsBracketComponent;
    Object.assign(instance, {
      matchSelected: { emit: vi.fn() },
      connectorLayouts: () => ({}),
    });
    return instance;
  };

  it('exposes translated labels, team fallbacks, and score visibility', () => {
    const instance = component();
    const match = SPORTS_BRACKET_FIXTURES.SINGLE_ELIMINATION.stages[0]?.matches[0];
    if (!match) {
      throw new Error('The shared single-elimination fixture must include a match.');
    }

    expect(instance.stageLabel('LOSERS_BRACKET')).toBe('Chave de repescagem');
    expect(instance.stateLabel(match)).toBe('Finalizada');
    expect(instance.teamName(match.homeTeam)).toBe(match.homeTeam?.name);
    expect(instance.teamName(null)).toBe('Livre');
    expect(instance.showScore(match)).toBe(true);
    expect(instance.showScore({ ...match, state: 'CHECK_IN' })).toBe(false);
  });

  it('emits selected matches and returns an empty connector layout by default', () => {
    const instance = component();

    instance.selectMatch('match-1');

    expect(instance.matchSelected.emit).toHaveBeenCalledWith('match-1');
    expect(instance.connectorLayout('missing-stage')).toEqual({ width: 0, height: 0, paths: [] });
  });
});
