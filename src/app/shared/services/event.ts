import { Timestamp } from '@firebase/firestore-types';

export interface EventItem {
  name: string;
  icon: string;
  course: string;
  slotsAvailable?: number;
  numberOfSubscriptions?: number;
  eventStartDate: Timestamp;
  eventEndDate: Timestamp;
  location?: {
    lat?: number;
    lon?: number;
    description?: string;
  };
  description?: string;
  shortDescription?: string;
  youtubeCode?: string;
  id?: string;
  button?: {
    text?: string;
    url: string;
  };
  inMajorEvent?: string;
  eventType?: string;
  public?: boolean;
  issueCertificate?: boolean;
  doublePresence?: boolean;
  collectAttendance?: boolean;
  eventGroup?: string[];
  createdBy: string;
  createdOn: Timestamp;
  attendanceCollectionStart?: Timestamp;
  attendanceCollectionEnd?: Timestamp;
  attendanceCode?: string;
  allowSubscription?: boolean;
}
