import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../../auth/auth.constants';
import { getAttendanceOralRoster } from '../../current-user/events/attendance-collection-feed';
import { EventAttendancesQueriesResolver } from './event-attendances.queries.resolver';

jest.mock('../../current-user/events/attendance-collection-feed', () => ({
  getAttendanceOralRoster: jest.fn(),
  getAttendanceScannerFeed: jest.fn(),
}));

describe('EventAttendancesQueriesResolver oral roster boundary', () => {
  const prisma = {};
  let resolver: EventAttendancesQueriesResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new EventAttendancesQueriesResolver(prisma as never, {} as never);
  });

  it('requires attendance-read permission on the oral-roster query', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventAttendancesQueriesResolver.prototype.eventAttendanceOralRoster,
      ),
    ).toEqual([Permission.EventAttendance.Read]);
  });

  it('forwards the event identity to the shared oral-roster projection and preserves its result', async () => {
    const roster = [
      { personId: 'person-1', eventId: 'event-1', fullName: 'Ada', identityDocument: '***' },
      { personId: 'person-2', eventId: 'event-1', fullName: 'Grace', status: 'PRESENT' },
    ];
    jest.mocked(getAttendanceOralRoster).mockResolvedValueOnce(roster as never);

    await expect(resolver.eventAttendanceOralRoster('event-1')).resolves.toBe(roster);
    expect(getAttendanceOralRoster).toHaveBeenCalledWith(prisma, 'event-1');
  });

  it('returns an empty roster without adding data to the shared projection', async () => {
    const roster: never[] = [];
    jest.mocked(getAttendanceOralRoster).mockResolvedValueOnce(roster);

    await expect(resolver.eventAttendanceOralRoster('event-empty')).resolves.toBe(roster);
    expect(getAttendanceOralRoster).toHaveBeenCalledWith(prisma, 'event-empty');
  });

  it('propagates projection failures without exposing a partial roster', async () => {
    const failure = new Error('oral roster unavailable');
    jest.mocked(getAttendanceOralRoster).mockRejectedValueOnce(failure);

    await expect(resolver.eventAttendanceOralRoster('event-1')).rejects.toBe(failure);
  });
});
