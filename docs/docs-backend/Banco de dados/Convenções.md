# Convenções

## Campos de auditoria e rastreio

Entidades possuem campos de auditoria e rastreio:

- `createdAt`;
- `createdById`;
- `updatedAt`;
- `updatedById`
- `deletedAt`.

Essa convenção permite auditoria, soft delete e rastreamento de alterações, o que é especialmente importante em registros operacionais e administrativos.


#### Soft delete

Várias tabelas possuem `deletedAt`, indicando exclusão lógica em vez de remoção física.

Esse padrão é útil para:

- Auditoria;
- Histórico;
- Recuperação de registros;
- Relatórios consistentes.

## Convenções de nomenclatura

### Nome de modelos

Os modelos seguem, em geral, a convenção `PascalCase`.

Exemplos:

- `MajorEvent`;
- `EventGroup`;
- `CertificateTemplate`;
- `EventAttendanceCollector`.

Quando a entidade representa um conceito composto, o nome é descritivo e explícito, reduzindo ambiguidade.

Observação: há uso de nomes no plural em alguns casos semânticos, como People, o que é mantido por aderência ao domínio.

### Nome de tabelas no banco

As tabelas físicas seguem a convenção `snake_case`, por meio de `@@map(...)`.

Exemplos:

- `major_events`;
- `event_groups`;
- `certificate_templates`;
- `event_attendances`;
- `price_tiers`.

Isso separa claramente a nomenclatura de aplicação da nomenclatura física do banco.

### Nome de campos

Os campos seguem, em regra, a convenção `camelCase`.

Exemplos:

- `startDate`;
- `endDate`;
- `createdAt`;
- `deletedAt`;
- `shouldIssueCertificate`;
- `onlineAttendanceCode`.

Campos booleanos costumam iniciar com verbos ou operadores lógicos:

- `should…`;
- `is…`;
- `allow…`;
- `auto…`.

Isso melhora a legibilidade e deixa o significado da regra explícito.

### Chaves estrangeiras

As chaves estrangeiras seguem o padrão:

```typescript
<nomeDaEntidade>Id
```

Exemplos:

- `majorEventId`;
- `eventGroupId`;
- `certificateTemplateId`;
- `personId`;
- `userId`.

Quando necessário, o campo relacional é declarado logo ao lado da chave:

```typescript
majorEventId String?
majorEvent   MajorEvent? @relation(fields: [majorEventId], references: [id])
```

Esse padrão facilita leitura, manutenção e entendimento do vínculo.

### Campos de lista e coleções

Campos que representam múltiplos registros usam forma plural:

- `events`;
- `subscriptions`;
- `attendances`;
- `certificateConfigs`;
- `certificates`.

Essa convenção reforça que o lado do modelo contém uma coleção relacionada.

### Enumerações

Enums seguem a convenção PascalCase nos tipos e UPPER_SNAKE_CASE nos valores.

Exemplos de tipos:

- `EventType`;
- `UserRole`;
- `CertificateScope`.

Exemplos de valores:

- `MINICURSO`;
- `PALESTRA`;
- `OTHER`.

Isso deixa o código consistente e explícito, especialmente em regras de negócio e estados finitos.