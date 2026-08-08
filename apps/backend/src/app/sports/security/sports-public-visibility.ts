import { Prisma, PublicationState, SportsCategoryStatus, SportsTournamentStatus } from '@prisma/client';

export const PUBLIC_SPORTS_MATCH_RELATIONS_WHERE = {
  category: {
    deletedAt: null,
    status: { not: SportsCategoryStatus.DRAFT },
    tournament: {
      deletedAt: null,
      status: { not: SportsTournamentStatus.DRAFT },
      majorEvent: {
        deletedAt: null,
        publicationState: PublicationState.PUBLISHED,
      },
    },
  },
  event: {
    deletedAt: null,
    publiclyVisible: true,
    publicationState: PublicationState.PUBLISHED,
  },
} satisfies Prisma.SportsMatchWhereInput;

export interface SportsMatchPublicationRecord {
  category: {
    deletedAt?: Date | null;
    status: SportsCategoryStatus;
    tournament: {
      deletedAt?: Date | null;
      status: SportsTournamentStatus;
      majorEvent: {
        deletedAt?: Date | null;
        publicationState: PublicationState;
      };
    };
  };
  event: {
    deletedAt: Date | null;
    publiclyVisible: boolean;
    publicationState: PublicationState;
  };
}

export function isSportsMatchPublic(match: SportsMatchPublicationRecord): boolean {
  return (
    !match.event.deletedAt &&
    match.event.publiclyVisible &&
    match.event.publicationState === PublicationState.PUBLISHED &&
    !match.category.deletedAt &&
    match.category.status !== SportsCategoryStatus.DRAFT &&
    !match.category.tournament.deletedAt &&
    match.category.tournament.status !== SportsTournamentStatus.DRAFT &&
    !match.category.tournament.majorEvent.deletedAt &&
    match.category.tournament.majorEvent.publicationState === PublicationState.PUBLISHED
  );
}
