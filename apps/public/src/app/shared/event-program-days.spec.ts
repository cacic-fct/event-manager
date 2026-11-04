import { createPublicEvent } from '@cacic-fct/event-manager-public-testing';
import { eventProgramDays } from './event-program-days';

describe('eventProgramDays', () => {
  it('groups and labels activities by the date in São Paulo across UTC midnight', () => {
    const late = new Date();
    late.setUTCMonth(6, 10);
    late.setUTCHours(2, 30, 0, 0);
    const early = new Date(late.getTime() + 60 * 60 * 1000);
    const first = createPublicEvent({ startDate: late.toISOString() });
    const second = createPublicEvent({ startDate: early.toISOString() });
    const year = late.getUTCFullYear();

    expect(eventProgramDays([second, first])).toEqual([
      expect.objectContaining({ id: `${year}-07-09`, shortDate: '09/07', events: [first] }),
      expect.objectContaining({ id: `${year}-07-10`, shortDate: '10/07', events: [second] }),
    ]);
  });
});
