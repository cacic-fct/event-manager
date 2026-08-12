import { MessageEvent } from '@nestjs/common';
import { firstValueFrom, NEVER, of } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { SPORTS_MATCH_OVERLAY_DEMO_ID } from '../overlays/sports-match-overlay.service';
import { SportsRealtimeController } from './sports-realtime.controller';

describe('SportsRealtimeController', () => {
  const event: MessageEvent = {
    id: 'cursor-new',
    data: { matchId: 'match-1', revision: 4 },
  };
  const prisma = {
    sportsMatch: {
      findFirst: jest.fn().mockResolvedValue({ id: 'match-1' }),
    },
    sportsTournament: {
      findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
    },
  };
  const policy = {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const replay = {
    replay: jest.fn().mockReturnValue(of(event)),
  };
  const currentUser = {};
  const realtime = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    watch: jest.fn(() => of()),
  };

  let controller: SportsRealtimeController;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sportsMatch.findFirst.mockResolvedValue({ id: 'match-1' });
    prisma.sportsTournament.findFirstOrThrow.mockResolvedValue({
      id: 'tournament-1',
    });
    policy.assertPermissions.mockResolvedValue(undefined);
    replay.replay.mockReturnValue(of(event));
    controller = new SportsRealtimeController(
      prisma as never,
      policy as never,
      currentUser as never,
      replay as never,
      realtime as never,
    );
  });

  it('authorizes public visibility before replaying from Last-Event-ID', async () => {
    await expect(firstValueFrom(controller.streamPublicMatch('match-1', 'cursor-previous'))).resolves.toEqual(event);

    expect(prisma.sportsMatch.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'match-1',
        deletedAt: null,
        event: expect.objectContaining({
          publiclyVisible: true,
          publicationState: 'PUBLISHED',
        }),
        category: expect.objectContaining({
          status: { not: 'DRAFT' },
          tournament: expect.objectContaining({
            status: { not: 'DRAFT' },
          }),
        }),
      }),
      select: { id: true },
    });
    expect(replay.replay).toHaveBeenCalledWith('match:match-1', 'cursor-previous', expect.any(Object));
  });

  it('does not disclose replay history when the match is not public', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValueOnce(null);

    await expect(firstValueFrom(controller.streamPublicMatch('match-1', undefined))).rejects.toThrow(
      'Partida esportiva pública não encontrada.',
    );

    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('keeps the demo overlay event stream open without reading match data', () => {
    expect(controller.streamPublicMatch(SPORTS_MATCH_OVERLAY_DEMO_ID, undefined)).toBe(NEVER);

    expect(prisma.sportsMatch.findFirst).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('checks scoped review permission before returning administrator events', async () => {
    const user = {
      sub: 'admin-1',
      token: 'token',
      permissionSet: new Set<string>(),
    };

    await expect(
      firstValueFrom(controller.streamReview('match-1', 'review-cursor', { user } as never)),
    ).resolves.toEqual(event);

    expect(policy.assertPermissions).toHaveBeenCalledWith(user, [Permission.SportsMatch.Review], {
      sportsMatchId: 'match-1',
    });
    expect(replay.replay).toHaveBeenCalledWith('review:match-1', 'review-cursor', expect.any(Object));
  });

  it('applies the same publication gate to tournament replay streams', async () => {
    await expect(
      firstValueFrom(controller.streamPublicTournament('tournament-1', 'tournament-cursor')),
    ).resolves.toEqual(event);

    expect(prisma.sportsTournament.findFirstOrThrow).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'tournament-1',
        deletedAt: null,
        majorEvent: expect.objectContaining({
          publicationState: 'PUBLISHED',
        }),
      }),
      select: { id: true },
    });
  });
});
