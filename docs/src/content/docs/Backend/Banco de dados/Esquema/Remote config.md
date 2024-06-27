---
title: Remote config
---

O Remote Config não está presente no Firestore.  
Ele é uma ferramenta separada, mas exerce um papel de banco de dados ágil.

```json
{
  "placesMap": {
    "id": string {
      "name": string,
      "description": string,
      "lat": string,
      "lon": string,
    }
  },
  "mapTabEnabled": boolean,
  "calendarItemViewDefault": boolean,
  "eventsTabEnabled": boolean,
  "adminWhitelist": string[], // E-mails dos administradores
  "professors": string[], // E-mails dos professores
  "calendarTabEnabled": boolean,
  "registerPrompt": boolean,
}
```
