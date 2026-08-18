import { signal } from '@angular/core';
import { SportsMatchBracketListComponent } from './sports-match-bracket-list.component';

type BracketListInternals = {
  stringValue(value: unknown): string;
  numberValue(value: unknown, fallback: number): number;
  matchState(value: unknown, fallback: 'SCHEDULED'): string;
  previewBracketTeam(
    read: unknown,
    registrationId: string,
  ): { id: string; name: string; logoUrl: string | null } | null;
};

describe('SportsMatchBracketListComponent helpers', () => {
  const component = Object.create(SportsMatchBracketListComponent.prototype) as SportsMatchBracketListComponent;
  const internals = component as unknown as BracketListInternals;

  beforeEach(() => {
    Object.assign(component, {
      workspace: {
        tournamentRead: signal({
          teams: [
            { id: 'team-1', name: 'Equipe Azul', logoUrl: '/logo.avif' },
            { id: 'team-2', name: 'Equipe sem escudo', logoUrl: null },
          ],
        }),
      },
    });
  });

  it('normalizes string and positive numeric form values', () => {
    expect(internals.stringValue('  group-a  ')).toBe('group-a');
    expect(internals.stringValue(42)).toBe('');
    expect(internals.numberValue(3, 1)).toBe(3);
    expect(internals.numberValue('4', 1)).toBe(4);
    expect(internals.numberValue(0, 2)).toBe(2);
    expect(internals.numberValue('invalid', 2)).toBe(2);
  });

  it('accepts every match state and falls back for invalid values', () => {
    for (const state of [
      'SCHEDULED',
      'CHECK_IN',
      'LIVE',
      'PAUSED',
      'AWAITING_REVIEW',
      'CANCELED',
      'DRAW',
      'FINISHED',
    ]) {
      expect(internals.matchState(state, 'SCHEDULED')).toBe(state);
    }
    expect(internals.matchState('UNKNOWN', 'SCHEDULED')).toBe('SCHEDULED');
    expect(internals.matchState(null, 'SCHEDULED')).toBe('SCHEDULED');
  });

  it('maps registration teams for bracket previews', () => {
    const read = {
      registrations: [
        { id: 'registration-1', teamId: 'team-1' },
        { id: 'registration-2', teamId: 'team-2' },
      ],
    };

    expect(internals.previewBracketTeam(read, 'registration-1')).toEqual({
      id: 'team-1',
      name: 'Equipe Azul',
      logoUrl: '/logo.avif',
    });
    expect(internals.previewBracketTeam(read, 'registration-2')).toEqual({
      id: 'team-2',
      name: 'Equipe sem escudo',
      logoUrl: null,
    });
    expect(internals.previewBracketTeam(read, 'missing')).toBeNull();
  });
});
