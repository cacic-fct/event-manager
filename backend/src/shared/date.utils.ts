import { Timestamp } from 'firebase-admin/firestore';

export const timestampFromDate = (date: Date): Timestamp => {
  return Timestamp.fromDate(date);
};
