import { generateSportsRoundRobin } from './sports-round-robin';

describe('round-robin generation', () => {
  it('schedules every registration pair exactly once without round conflicts', () => {
    const rounds = generateSportsRoundRobin({
      registrationIds: ['a', 'b', 'c', 'd'],
    });
    const pairs = rounds.flatMap((round) =>
      round.matches.map((match) =>
        [match.homeRegistrationId, match.awayRegistrationId].sort().join(':'),
      ),
    );

    expect(rounds).toHaveLength(3);
    expect(new Set(pairs)).toEqual(new Set(['a:b', 'a:c', 'a:d', 'b:c', 'b:d', 'c:d']));
    for (const round of rounds) {
      const participants = round.matches.flatMap((match) => [
        match.homeRegistrationId,
        match.awayRegistrationId,
      ]);
      expect(new Set(participants).size).toBe(participants.length);
    }
  });

  it('records one bye per round when the number of registrations is odd', () => {
    const rounds = generateSportsRoundRobin({
      registrationIds: ['a', 'b', 'c', 'd', 'e'],
    });

    expect(rounds).toHaveLength(5);
    expect(rounds.map((round) => round.byeRegistrationId).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(rounds.every((round) => round.matches.length === 2)).toBe(true);
  });

  it('creates a second leg with reversed home and away sides', () => {
    const rounds = generateSportsRoundRobin({
      registrationIds: ['a', 'b', 'c', 'd'],
      doubleRoundRobin: true,
    });

    expect(rounds).toHaveLength(6);
    for (let index = 0; index < 3; index += 1) {
      expect(rounds[index + 3].matches).toEqual(
        rounds[index].matches.map((match) => ({
          roundNumber: match.roundNumber + 3,
          position: match.position,
          homeRegistrationId: match.awayRegistrationId,
          awayRegistrationId: match.homeRegistrationId,
        })),
      );
    }
  });

  it('rejects duplicate registrations and too-small stages', () => {
    expect(() =>
      generateSportsRoundRobin({ registrationIds: ['a', 'a'] }),
    ).toThrow('appears more than once');
    expect(() =>
      generateSportsRoundRobin({ registrationIds: ['a'] }),
    ).toThrow('requires at least two registrations');
  });
});
