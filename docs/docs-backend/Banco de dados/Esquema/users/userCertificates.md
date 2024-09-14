---
title: userCertificates
---

Nome: `uid` do template do certificado  
Caminho: `/users/{userID}/userCertificates/majorEvents/{majorEventID}/{certificateName}`

```typescript
export interface UserCertificateDocument {
  // Referência do documento do certificado na coleção de certificados daquele major event
  certificateReference: DocumentReference;
  // uuid do certificado na coleção de certificados daquele major event
  certificateDoc: string;
  id?: string;
}
```
