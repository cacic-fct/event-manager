# Autorização e permissões

O backend é a autoridade final para permissões administrativas. A interface orienta a navegação, mas cada operação deve ser autorizada novamente para o alvo real.

## Fontes de autoridade

| Fonte | Responsabilidade |
| --- | --- |
| Keycloak | Autenticação, entrada administrativa com `access` e bypass com `super-admin`. |
| Catálogo compartilhado | Nomes de permissões, dependências, cargos predefinidos, escopos compatíveis e requisitos de abas. |
| Cargos e grupos no banco | Atribuições a pessoas ou grupos, herança, escopos e períodos de validade. |
| Regras de domínio | Público-alvo, publicação, recursos congelados, exclusão e elegibilidade operacional. |

Não replique as permissões humanas em recursos, escopos ou políticas do Keycloak Authorization Services. Papéis M2M são separados e exigem validação do principal e do audience da integração.

## Onde fica a implementação

- `libs/shared-permissions/src/lib/permission-types.ts` e `permission-catalog.ts`: constantes e catálogo;
- `libs/shared-permissions/src/lib/permission-role-policy.ts`: cargos predefinidos e dependências;
- `apps/backend/src/app/auth/guards/keycloak-scope.guard.ts`: autenticação e metadados dos handlers;
- `apps/backend/src/app/authorization/authorization-policy.service.ts`: autorização contextual;
- `apps/backend/src/app/authorization/effective-role-scopes.ts`: cálculo das permissões efetivas;
- `apps/backend/src/app/authorization/permission-management.service.ts` e `.resolver.ts`: gerenciamento de cargos e grupos;
- `apps/backend/prisma/schema/permissions.prisma`: persistência;
- `apps/admin/src/app/permissions/permissions.service.ts`: avaliação para navegação;
- `apps/admin/src/app/permissions/management`: gerenciamento no painel.

## Modelo atual

Um cargo reúne permissões do catálogo `recurso#ação` e pode herdar outros cargos. Atribuições ligam o cargo diretamente a uma pessoa ou a um grupo de permissões. Os grupos reúnem pessoas; não são grupos de eventos.

Cada atribuição possui escopos `GLOBAL`, `MAJOR_EVENT`, `EVENT_GROUP` ou `EVENT`. A atribuição, seus escopos e a participação em grupo podem ter períodos diferentes de validade. Registros arquivados não produzem acesso; `validFrom` é inclusivo e `validUntil` exclusivo.

O avaliador exige exatamente uma pessoa ativa vinculada ao usuário. É possível preparar uma atribuição antes do vínculo de conta, mas ela só produz acesso quando o vínculo e o papel de entrada do Keycloak estiverem válidos.

As permissões efetivas combinam cargos diretos, grupos ativos, herança e dependências obrigatórias. Os cargos predefinidos usam definições do catálogo compartilhado. `super-admin` permanece externo e não pode ser atribuído pelo gerenciamento do Event Manager.

O método interno `findActiveGrants` delega a `findActiveRolePermissionScopes`; ele não consulta uma tabela de concessões diretas. Não recrie o modelo antigo de permissões individuais para uma nova funcionalidade.

## Fluxo de uma requisição

1. O guard autentica a sessão ou token e verifica onboarding e papéis exigidos.
2. `RequirePermissions(Permission.Resource.Action)` define as permissões administrativas necessárias.
3. A política calcula o acesso efetivo pelos cargos e seus escopos ativos.
4. O contexto resolve o alvo pelos argumentos GraphQL ou por `params`, `query` e `body` em REST.
5. A política verifica permissão, compatibilidade de escopo e público-alvo aplicável.
6. A operação verifica recursos congelados e demais regras de domínio, executa a alteração e registra auditoria na mesma transação.

Quando a permissão depende de criação ou atualização, o serviço pode escolher a exigência após carregar o registro. Os métodos de salvamento de cargos/grupos fazem essa autorização explicitamente; preserve esses checks ao alterar os metadados do resolver.

## Escopos e coleções

Permissões globais alcançam todos os alvos compatíveis. Permissões limitadas dependem dos vínculos reais do recurso com evento, grupo e grande evento; não confie somente no ID de pai enviado pelo cliente. Recursos esportivos reutilizam essa hierarquia.

Algumas permissões são sempre globais. Consulte as regras compartilhadas de compatibilidade e `EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS` antes de criar um novo escopo.

`AllowScopedCollectionPermissions()` permite admitir uma coleção sem alvo único. `RequireCollectionPermissions(...)` também evita interpretar IDs aninhados como um único contexto. Nenhum deles filtra as linhas automaticamente.

O serviço deve aplicar os alvos acessíveis à consulta, inclusive em totais, agregações, exportações e campos GraphQL aninhados. Os helpers `accessibleEventTargets`, `accessibleEventGroupIds` e `accessibleMajorEventIds` retornam `null` para acesso sem limitação de escopo e conjuntos vazios quando nenhum alvo está acessível. Filtros de público-alvo, publicação e exclusão continuam necessários.

Operações em lote verificam todos os alvos afetados. O acesso à aba não autoriza todos os registros dela.

## Gerenciamento e auditoria

Use **Permissões > Gerenciamento de permissões**. O serviço preserva versões otimistas, transações serializáveis, dependências, prevenção de ciclos e limites de delegação. Alterar um cargo herdado também exige considerar seus descendentes.

Arquivar um cargo personalizado arquiva suas atribuições ativas e os vínculos de herança que o usam como pai. Arquivar um grupo arquiva suas participações. Essas ações retiram o acesso derivado dessas relações e preservam o histórico com o motivo do arquivamento. Outros cargos ou grupos ainda podem conceder a mesma permissão.

Mudanças de cargos/grupos e novas operações de domínio devem registrar ator, entidade, escopo e valores relevantes por `AuditLogService.record(options, tx)`, na transação da alteração. Evite snapshots com dados pessoais desnecessários e registros duplicados entre resolver e serviço.

## Adicionar uma permissão

1. Atualize a constante, o catálogo e as regras de escopo na biblioteca compartilhada.
2. Revise dependências obrigatórias/contextuais, cargos predefinidos, modelos, labels e dados incluídos.
3. Proteja o handler ou serviço e garanta a resolução do alvo real.
4. Aplique filtros de coleção e auditoria quando cabíveis.
5. Teste acesso permitido, negação por escopo, validade, herança e ausência de vínculo de conta, conforme a mudança.
6. Atualize avaliação de abas, mensagens e stories do painel.

Para detalhes de implementação por agentes, consulte os [arquivos de autorização](../../apps/backend/src/app/authorization/AGENTS.md) e [do catálogo](../../libs/shared-permissions/AGENTS.md). Para operação humana, leia [Concessão de permissões](../docs-manual/07-Procedimentos/Cargos/Concessão%20de%20permissões.md).
