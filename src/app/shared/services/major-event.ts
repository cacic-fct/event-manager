import { Timestamp } from '@firebase/firestore-types';

export interface MajorEventItem {
  name: string;
  icon: string;
  course: string;
  dateStart: Timestamp;
  dateEnd?: Timestamp;
  subscriptionDateStart?: Timestamp;
  subscriptionDateEnd?: Timestamp;
  price: {
    priceStudents?: number;
    priceOtherStudents?: number;
    priceProfessors?: number;
    priceSingle?: number;
    isFree?: boolean;
  };
  accountChavePix?: string;
  accountBank?: string;
  accountName?: string;
  accountDocument?: string;
  accountAgency?: string;
  accountNumber?: string;
  description?: string;
  button?: {
    text?: string;
    url: string;
  };
  public: boolean;
  createdBy: string;
  createdOn: Timestamp;
  id: string;
}
