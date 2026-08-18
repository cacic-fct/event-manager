import { ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, SSE_METADATA } from '@nestjs/common/constants';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom, of, take } from 'rxjs';
import { SportsRealtimeController } from './sports-realtime.controller';

describe('SportsRealtimeController uncovered authenticated streams', () => {
  let prisma: {
    sportsMatch: { findFirst: jest.Mock };
    sportsTournament: { findFirstOrThrow: jest.Mock };
  };
  let policy: { assertPermissions: jest.Mock };
  let currentUser: { requireCurrentPerson: jest.Mock };
  let replay: { replay: jest.Mock };
  let realtime: { scope: jest.Mock; watch: jest.Mock };
  let controller: SportsRealtimeController;

  beforeEach(() => {
    prisma = {
      sportsMatch: { findFirst: jest.fn() },
      sportsTournament: { findFirstOrThrow: jest.fn() },
    };
    policy = {
      assertPermissions: jest.fn().mockResolvedValue(undefined),
    };
    currentUser = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    };
    replay = {
      replay: jest.fn().mockReturnValue(of({ id: 'cursor-new', data: { revision: 4 } })),
    };
    realtime = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
      watch: jest.fn(() => of()),
    };
    controller = new SportsRealtimeController(
      prisma as never,
      policy as never,
      currentUser as never,
      replay as never,
      realtime as never,
    );
  });

  it('declares authenticated SSE paths for current autoroute and tournament review streams', () => {
    const autoroute = SportsRealtimeController.prototype.streamCurrentUserAutoroute;
    const tournamentReview = SportsRealtimeController.prototype.streamTournamentReview;

    expect(Reflect.getMetadata(PATH_METADATA, autoroute)).toBe('current/autoroute-events');
    expect(Reflect.getMetadata(METHOD_METADATA, autoroute)).toBe(0);
    expect(Reflect.getMetadata(SSE_METADATA, autoroute)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, tournamentReview)).toBe('tournaments/:tournamentId/review-events');
    expect(Reflect.getMetadata(METHOD_METADATA, tournamentReview)).toBe(0);
    expect(Reflect.getMetadata(SSE_METADATA, tournamentReview)).toBe(true);
  });

  it('resolves the current person before creating a replay scope for autoroute invalidations', async () => {
    const request = { user: { sub: 'user-1' } };

    await expect(
      firstValueFrom(
        controller.streamCurrentUserAutoroute('cursor-previous', request as never).pipe(take(1)),
      ),
    ).resolves.toEqual({ id: 'cursor-new', data: { revision: 4 } });

    expect(currentUser.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(realtime.scope).toHaveBeenCalledWith('autoroute', 'person-1');
    expect(realtime.watch).toHaveBeenCalledWith('autoroute:person-1');
    expect(replay.replay).toHaveBeenCalledWith(
      'autoroute:person-1',
      'cursor-previous',
      expect.anything(),
    );
  });

  it('does not disclose autoroute replay data when current-person resolution fails', async () => {
    const failure = new ForbiddenException('Current person is unavailable.');
    currentUser.requireCurrentPerson.mockRejectedValue(failure);

    await expect(
      firstValueFrom(
        controller.streamCurrentUserAutoroute(undefined, { user: { sub: 'user-1' } } as never).pipe(take(1)),
      ),
    ).rejects.toBe(failure);

    expect(realtime.scope).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('checks tournament-read scope before replaying tournament review invalidations', async () => {
    const user = { sub: 'admin-1' };

    await expect(
      firstValueFrom(
        controller.streamTournamentReview('tournament-1', 'review-cursor', { user } as never).pipe(take(1)),
      ),
    ).resolves.toEqual({ id: 'cursor-new', data: { revision: 4 } });

    expect(policy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.SportsTournament.Read],
      { sportsTournamentId: 'tournament-1' },
    );
    expect(realtime.scope).toHaveBeenCalledWith('admin-tournament', 'tournament-1');
    expect(realtime.watch).toHaveBeenCalledWith('admin-tournament:tournament-1');
    expect(replay.replay).toHaveBeenCalledWith(
      'admin-tournament:tournament-1',
      'review-cursor',
      expect.anything(),
    );
  });

  it('does not replay tournament review events when scoped permission is denied', async () => {
    const failure = new ForbiddenException('Tournament read permission required.');
    policy.assertPermissions.mockRejectedValue(failure);

    await expect(
      firstValueFrom(
        controller.streamTournamentReview('tournament-1', undefined, { user: { sub: 'admin-1' } } as never).pipe(
          take(1),
        ),
      ),
    ).rejects.toBe(failure);

    expect(replay.replay).not.toHaveBeenCalled();
  });
});
