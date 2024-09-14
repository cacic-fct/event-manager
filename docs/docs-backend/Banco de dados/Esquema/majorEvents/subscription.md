---
title: majorEvent-subscription
---

Nome do documento: Igual ao ID do usuário  
Caminho: `majorEvents/{majorEventID}/subscriptions/{subscriptionID}`

```typescript
export interface MajorEventSubscription {
  time: Timestamp;
  payment: {
    status: number;
    time: Timestamp;
    error?: string;
    price?: number;
    author: string;
    validationTime: Timestamp;
    validationAuthor: string;
  };
  subscriptionType: number;
  subscribedToEvents: string[];
}
```
