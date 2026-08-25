import { BadRequestException } from '@nestjs/common';
import { PublicationState, SportsCategoryStatus, SportsTournamentStatus } from '@prisma/client';
import { SportsMatchAdminService } from './sports-match-admin.service';

describe('SportsMatchAdminService publication', () => {
  const actor = { sub: 'admin-1' } as never;
  const frozen = { assertEventMutable: jest.fn() };
  const publication = { setEventPublicationState: jest.fn() };
  const prisma = { sportsMatch: { findFirst: jest.fn() } };

  beforeEach(() => {
    jest.clearAllMocks();
    frozen.assertEventMutable.mockResolvedValue(undefined);
    publication.setEventPublicationState.mockResolvedValue({ eventIds: ['event-1'], majorEventIds: [] });
    prisma.sportsMatch.findFirst.mockResolvedValue({
      id: 'match-1',
      eventId: 'event-1',
      category: {
        status: SportsCategoryStatus.ACTIVE,
        tournament: {
          status: SportsTournamentStatus.LIVE,
          majorEvent: { publicationState: PublicationState.PUBLISHED },
        },
      },
    });
  });

  function createService(): SportsMatchAdminService {
    return new SportsMatchAdminService(
      prisma as never,
      frozen as never,
      {} as never,
      {} as never,
      publication as never,
    );
  }

  it('publishes the backing event and enables public-site visibility', async () => {
    await expect(createService().publishMatch('match-1', actor)).resolves.toEqual({ id: 'match-1' });

    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(publication.setEventPublicationState).toHaveBeenCalledWith('event-1', PublicationState.PUBLISHED, actor, {
      isPubliclyListed: true,
    });
  });

  it('does not publish a match while its public parent chain is still draft', async () => {
    prisma.sportsMatch.findFirst.mockResolvedValueOnce({
      id: 'match-1',
      eventId: 'event-1',
      category: {
        status: SportsCategoryStatus.DRAFT,
        tournament: {
          status: SportsTournamentStatus.DRAFT,
          majorEvent: { publicationState: PublicationState.DRAFT },
        },
      },
    });

    await expect(createService().publishMatch('match-1', actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(publication.setEventPublicationState).not.toHaveBeenCalled();
  });

  it('unpublishes the backing event and hides it from the public site', async () => {
    await expect(createService().unpublishMatch('match-1', actor)).resolves.toEqual({ id: 'match-1' });

    expect(publication.setEventPublicationState).toHaveBeenCalledWith('event-1', PublicationState.UNPUBLISHED, actor, {
      isPubliclyListed: false,
    });
  });
});
