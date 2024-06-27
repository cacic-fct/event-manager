---
title: majorEvent
---

Nome do documento: `uuid`  
Caminho: `majorEvents/{majorEventID}`

```typescript
export interface MajorEventItem {
  name: string;
  course: string;
  description?: string;
  eventStartDate: Timestamp;
  eventEndDate: Timestamp;
  subscriptionStartDate?: Timestamp;
  subscriptionEndDate?: Timestamp;
  maxCourses?: number;
  maxLectures?: number;
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
  } | null;
  button?: {
    text?: string;
    url: string;
  } | null;
  public: boolean;
  createdBy: string;
  createdOn: Timestamp;
  events: string[];
  id?: string;
}
```
