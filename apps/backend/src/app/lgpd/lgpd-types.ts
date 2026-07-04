import { Prisma } from '@prisma/client';

export type LgpdCategoryData = Record<string, unknown>;
export type LgpdUserLookup = { userId: string; email?: string };
export type LgpdResolvedPerson = Prisma.PeopleGetPayload<{
  include: { user: true; mergedFrom: true; mergedInto: true };
}>;
export type DataSubjectResolution = {
  userIds: string[];
  personIds: string[];
  emails: string[];
  people: LgpdResolvedPerson[];
};
