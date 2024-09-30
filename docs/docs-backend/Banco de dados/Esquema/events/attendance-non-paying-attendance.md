---
title: attendance e non-paying-attendance
---

Nome do documento: Igual ao ID do usuário

Caminhos:

- `events/{eventID}/attendance/{userID}` — Presença paga ou presença em evento gratuito.
- `events/{eventID}/non-paying-attendance/{userID}` — Presença de quem não pagou um evento pago.

```typescript
interface Attendance {
  time: Timestamp;
  author: string; // Usuário que coletou a presença. Pode ser o próprio.
  source?: 'online' | 'scanner' | 'manual';
  id?: string;
}
```
