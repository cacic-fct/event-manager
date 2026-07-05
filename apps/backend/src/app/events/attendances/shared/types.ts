export type { GraphqlContext } from '../../../current-user/selects';

export type CsvRow = Record<string, string>;

export type PersonMatch = {
  id: string;
  name: string;
  email: string | null;
  secondaryEmails: string[];
  phone?: string | null;
  identityDocument: string | null;
  academicId: string | null;
  userId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ImportValueMatchResult = {
  personByValue: Map<string, PersonMatch>;
  ambiguousPeopleByValue: Map<string, PersonMatch[]>;
};

export type SubscriptionImportPersonData = {
  email?: string;
  fullName?: string;
  enrollmentNumber?: string;
  identityDocument?: string;
};
