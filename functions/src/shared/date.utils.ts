import { Timestamp } from 'firebase-admin/firestore';
import { Timestamp as TimestampType } from '@firebase/firestore-types';

export const timestampFromDate = (date: Date): TimestampType => {
  return Timestamp.fromDate(date);
};
