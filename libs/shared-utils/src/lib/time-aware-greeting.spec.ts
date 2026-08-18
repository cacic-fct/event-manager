import { timeAwareGreeting } from './time-aware-greeting';

describe('timeAwareGreeting', () => {
  it.each([
    [4, 'Boa madrugada'],
    [5, 'Bom dia'],
    [12, 'Boa tarde'],
    [18, 'Boa noite'],
  ])('uses the expected greeting at %i:00', (hour, expected) => {
    const date = new Date(2026, 7, 16, hour);

    expect(timeAwareGreeting(date, 'Renan Yudi')).toBe(`${expected}, Renan Yudi!`);
  });

  it('can use only the first name for compact public surfaces', () => {
    expect(timeAwareGreeting(new Date(2026, 7, 16, 9), '  Renan Yudi  ', { firstNameOnly: true })).toBe(
      'Bom dia, Renan!',
    );
  });
});
