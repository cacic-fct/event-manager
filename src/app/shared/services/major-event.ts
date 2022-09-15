import { Timestamp } from '@firebase/firestore-types';

export interface MajorEventItem {
  name: string;
  course: string;
  eventStartDate: Timestamp;
  eventEndDate?: Timestamp;
  subscriptionStartDate?: Timestamp;
  subscriptionEndDate?: Timestamp;
  maxCourses: number;
  maxLectures: number;
  price: {
    students?: number;
    otherStudents?: number;
    professors?: number;
    single?: number;
    isFree?: boolean;
  };
  paymentInfo?: {
    chavePix?: string;
    bankName?: string;
    name?: string;
    document?: string;
    agency?: string;
    accountNumber?: string;
    additionalPaymentInformation?: string;
  };
  description?: string;
  button?: {
    text?: string;
    url: string;
  };
  public: boolean;
  createdBy: string;
  createdOn: Timestamp | Date;
  id?: string;
}
