import { myDayCountdown, myDayTimeProgress } from './my-day-date';

describe('My Day time glance helpers', () => {
  it('uses calm minute-based countdown copy without seconds', () => {
    const now = new Date('2026-08-16T18:18:15-03:00');

    expect(myDayCountdown('2026-08-16T19:00:00-03:00', now)).toBe('em 42 min');
    expect(myDayCountdown('2026-08-16T18:24:00-03:00', now)).toBe('começando em breve');
    expect(myDayCountdown('2026-08-16T18:00:00-03:00', now)).toBeNull();
  });

  it('positions now between midnight and the event time', () => {
    const progress = myDayTimeProgress('2026-08-16T18:00:00-03:00', new Date('2026-08-16T09:00:00-03:00'));

    expect(progress).toBeCloseTo(50);
  });
});
