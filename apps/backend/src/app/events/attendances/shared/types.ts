export type { GraphqlContext } from '../../../current-user/selects';

export type {
  CsvRow,
  PersonCsvImportMatch as PersonMatch,
  PersonCsvImportMatchResult as ImportValueMatchResult,
} from '../../../common/person-csv-import-support';

export type SubscriptionImportPersonData = {
  email?: string;
  fullName?: string;
  enrollmentNumber?: string;
  identityDocument?: string;
};
