---
title: certificateData
---

Nome do documento: `uid` do certificado  
Caminho: `majorEvents/{majorEventID}/majorEventCertificates/{certificateID}`

```typescript
export interface CertificateStoreData {
  certificateContent: {
    custom?: string;
    type: string;
  };
  certificateName: string;
  certificateTemplate: string;
  eventType: {
    type: string;
    custom?: string;
  };
  participationType: {
    type: string;
    custom?: string;
  };
  extraText: string | null;
  id?: string;
}
```
