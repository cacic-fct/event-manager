---
title: Convenções
sidebar:
  order: 2
---

## Nomenclatura

- Utilizar "lower camel case" (lowerCamelCase) em todos os campos
- "ID" sempre em maíusculas
- Campos e nomes sempre em inglês

## Coleções

### Nomes únicos

Toda coleção deve possuir um nome único. Exemplo:

**Incorreto:**

- `majorEventID/subscriptions`
- `eventID/subscriptions`

**Correto:**

- `majorEventID/majorEventSubscriptions`
- `eventID/eventSubscriptions`

Isso se deve a um requisito do Firestore.

## null: null

O campo `null` é utilizado para que os dados sejam exibidos no Console do Firestore. Caso ele não existisse, o documento seria oculto, mesmo com subcoleções.
