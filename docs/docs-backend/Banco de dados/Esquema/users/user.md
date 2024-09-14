---
title: user
---

Nome do documento: `uuid` do usuário provido pelo Auth.  
Caminho: `users/{userID}`

```typescript
export interface User {
  uid?: string;
  email?: string;
  linkedPersonalEmail?: boolean;
  displayName?: string;
  fullName?: string;
  cpf?: string;
  phone?: string;
  photoURL?: string;
  academicID?: string;
  dataVersion?: string;
  associateStatus?: 'undergraduate' | 'graduate' | 'professor' | 'adjunctProfessor' | 'employee' | 'external' | 'other';
  pending?: {
    onlineAttendance?: string[];
  };
}
```
