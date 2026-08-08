import { PublicationState, SportsCategoryStatus, SportsTournamentStatus } from '@prisma/client';
import { isSportsMatchPublic } from './sports-public-visibility';

describe('sports public visibility', () => {
  it('requires every publication boundary to be public', () => {
    const match = publicMatch();

    expect(isSportsMatchPublic(match)).toBe(true);
    expect(
      isSportsMatchPublic({
        ...match,
        category: {
          ...match.category,
          status: SportsCategoryStatus.DRAFT,
        },
      }),
    ).toBe(false);
    expect(
      isSportsMatchPublic({
        ...match,
        category: {
          ...match.category,
          tournament: {
            ...match.category.tournament,
            status: SportsTournamentStatus.DRAFT,
          },
        },
      }),
    ).toBe(false);
  });
});

function publicMatch() {
  return {
    event: {
      deletedAt: null,
      publiclyVisible: true,
      publicationState: PublicationState.PUBLISHED,
    },
    category: {
      deletedAt: null,
      status: SportsCategoryStatus.ACTIVE,
      tournament: {
        deletedAt: null,
        status: SportsTournamentStatus.LIVE,
        majorEvent: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
      },
    },
  };
}
