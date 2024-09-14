---
title: certificateDataAdmin.md
---

Caminho: `majorEvents/{majorEventID}/majorEventCertificates/{certificateID}/certificateDataAdmin/data`

```typescript
certificateAdmin.ref.set({
  issuedTo: {
    toPayer: data.certificateData.issuedTo.toPayer, // boolean obrigatório
    toNonSubscriber: data.certificateData.issuedTo.toNonSubscriber, // boolean obrigatório
    toNonPayer: data.certificateData.issuedTo.toNonPayer, // boolean obrigatório
    toList: data.certificateData.issuedTo.toList, // string[] obrigatório
  },
  firstIssuedOn: FieldValue.serverTimestamp(), // Timestamp obrigatório
  firstIssuedBy: context.auth.uid, // string obrigatório
});
```

```typescript
failed: {
  error: string;
  uid: string; // uid do usuário que falhou
}
```
