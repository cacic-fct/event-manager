import { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';

export type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

export type CsvRow = Record<string, string>;

export type PersonMatch = {
  id: string;
  name: string;
  email: string | null;
  secondaryEmails: string[];
  identityDocument: string | null;
  academicId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SubscriptionImportPersonData = {
  email?: string;
  fullName?: string;
  enrollmentNumber?: string;
  identityDocument?: string;
};
