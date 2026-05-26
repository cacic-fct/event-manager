import { Prisma } from '@prisma/client';

export const actionablePendingMergeCandidateWhere = {
  status: 'PENDING',
  personA: {
    is: {
      deletedAt: null,
      mergedIntoId: null,
    },
  },
  personB: {
    is: {
      deletedAt: null,
      mergedIntoId: null,
    },
  },
} satisfies Prisma.MergeCandidateWhereInput;

export const stalePendingMergeCandidateWhere = {
  status: 'PENDING',
  OR: [
    {
      personA: {
        is: {
          OR: [{ deletedAt: { not: null } }, { mergedIntoId: { not: null } }],
        },
      },
    },
    {
      personB: {
        is: {
          OR: [{ deletedAt: { not: null } }, { mergedIntoId: { not: null } }],
        },
      },
    },
  ],
} satisfies Prisma.MergeCandidateWhereInput;
