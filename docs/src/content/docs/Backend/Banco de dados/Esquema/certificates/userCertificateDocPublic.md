---
title: userCertificateDocPublic
---

Caminho: `/certificates/{majorEventID/{certificateName}/{userCertificateID}`

Visível publicamente.

```typescript
export interface CertificateDocPublic {
  certificateID: string; // uid do template do certificado
  document: string; // CPF com máscara: •••.000.000-••
  fullName: string; // Nome completo do usuário - Armazenamos para que não seja modificado
  issueDate: Timestamp; // Data de emissão falsa
  attendedEvents: string[]; // Lista com o ID dos eventos que o usuário esteve presente
}
```
