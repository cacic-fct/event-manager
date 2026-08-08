import {
  SPORTS_PRESET_KEYS,
  SPORTS_PRESETS,
  SportsPresetDefinition,
  validateSportsPresetCatalog,
} from './sports-presets';

describe('sports presets', () => {
  it('provides a validated definition for every supported preset', () => {
    expect(Object.keys(SPORTS_PRESETS).sort()).toEqual([...SPORTS_PRESET_KEYS].sort());
    expect(() => validateSportsPresetCatalog(SPORTS_PRESETS)).not.toThrow();
  });

  it('keeps flexible presets for decimal scoring and placement-based sports', () => {
    expect(SPORTS_PRESETS.CHESS.score).toMatchObject({
      allowDraw: true,
      pointStep: 0.5,
    });
    expect(SPORTS_PRESETS.SWIMMING.score).toMatchObject({
      strategy: 'PLACEMENT',
      higherWins: false,
    });
    expect(SPORTS_PRESETS.OTHER).toMatchObject({
      score: { strategy: 'CUSTOM' },
      roster: { maximumPlayers: null },
    });
  });

  it('rejects malformed roster and period limits', () => {
    const invalid = {
      ...SPORTS_PRESETS,
      SOCCER: {
        ...SPORTS_PRESETS.SOCCER,
        roster: {
          ...SPORTS_PRESETS.SOCCER.roster,
          maximumPlayers: 2,
        },
      } satisfies SportsPresetDefinition,
    };

    expect(() => validateSportsPresetCatalog(invalid)).toThrow(
      'Sports preset SOCCER has a maximum roster below its minimum.',
    );
  });
});
