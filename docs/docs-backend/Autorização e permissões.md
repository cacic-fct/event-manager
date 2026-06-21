# Autorização e permissões

O backend do CACiC Event Manager é a autoridade final para permissões administrativas. A interface usa as permissões para orientar a navegação, mas toda operação protegida precisa ser autorizada novamente no backend.

## Visão geral

O sistema combina quatro fontes:

| Fonte | Responsabilidade |
| --- | --- |
| Keycloak | Autenticação, sessão, entrada no Event Manager e bypass de super administrador. |
| Catálogo compartilhado | Nomes de permissões, labels, presets e requisitos de abas. |
| Concessões no banco | Permissões efetivas por usuário, com escopo e validade. |
| Regras de domínio | Restrições contextuais, como recurso congelado, recurso removido, janela de coleta e vínculo com evento. |

Os principais pontos de manutenção são:

- `libs/shared-permissions/src/lib/shared-permissions.ts`;
- `apps/backend/src/app/auth/guards/keycloak-scope.guard.ts`;
- `apps/backend/src/app/authorization/authorization-policy.service.ts`;
- `apps/backend/src/app/authorization/permission-grants.service.ts`;
- `apps/backend/src/app/authorization/permission-grants.resolver.ts`;
- `apps/admin/src/app/shared/services/workspace-permissions.service.ts`;
- `apps/admin/src/app/shared/services/workspace-people.service.ts`.

## Fluxo de uma requisição

1. O guard autentica a sessão ou o bearer token.
2. O guard lê os metadados de `RequireRoles(...)` e `RequirePermissions(...)`.
3. Papéis M2M são verificados pelo caminho de roles quando o endpoint é uma integração interna.
4. Permissões humanas do Event Manager são enviadas para `AuthorizationPolicyService`.
5. A camada de autorização exige `event-manager#access`, exceto quando o usuário possui `event-manager#super-admin`.
6. A camada de autorização procura concessões ativas no banco.
7. A camada de autorização resolve o alvo real da operação a partir dos argumentos GraphQL ou de `params`, `query` e `body` em REST.
8. A operação só continua se a concessão cobre a permissão e o alvo.

Use `RequirePermissions(Permission.Resource.Action)` em handlers administrativos. Não use strings soltas.

## Papéis do Keycloak

O Event Manager usa apenas papéis humanos de alto nível no Keycloak:

- `event-manager#access`: permite entrar no Event Manager;
- `event-manager#super-admin`: bypass para todas as permissões do Event Manager.

Papéis M2M continuam existindo para contas de serviço, mas não devem ser usados para representar permissões humanas do painel.

## Concessões do Event Manager

As concessões ficam na tabela `event_manager_permission_grants`. Uma concessão ativa possui:

- `userId`: usuário que recebe a permissão;
- `personId`: pessoa vinculada, quando aplicável para auditoria e UI;
- `permission`: valor do catálogo compartilhado;
- `scope`: `GLOBAL`, `EVENT`, `MAJOR_EVENT` ou `EVENT_GROUP`;
- alvo do escopo, quando não for global;
- `validFrom` e `validUntil`, quando o acesso é agendado ou temporário;
- `deletedAt`, usado para revogação lógica.

Uma concessão é considerada ativa quando não foi removida, já passou de `validFrom` e ainda não chegou a `validUntil`.

## Escopos

Uma concessão global satisfaz a permissão em qualquer alvo.

Uma concessão de evento satisfaz operações daquele evento. Quando o evento pertence a um grupo ou grande evento, a camada de autorização também considera esses vínculos para resolver o contexto.

Uma concessão de grande evento satisfaz operações ligadas ao grande evento, como inscrições de grande evento, comprovantes e certificados desse contexto.

Uma concessão de grupo de eventos satisfaz operações ligadas ao grupo quando a operação possui contexto suficiente para resolver esse grupo.

Algumas permissões são sempre globais, como gestão de pessoas, resolução de duplicidades e gestão de permissões. Mantenha essa regra em `EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS`.

## Resolução de contexto

O guard monta o contexto de autorização a partir dos argumentos da operação. A camada de autorização reconhece identificadores diretos como `eventId`, `majorEventId` e `eventGroupId`, além de recursos que precisam ser resolvidos no banco:

- inscrições;
- comprovantes;
- ações de validação de comprovante;
- configurações de certificado;
- certificados emitidos.

Quando a operação recebe um `id` genérico e só exige permissões de um recurso, a camada de autorização tenta tratar esse `id` como o recurso primário. Isso evita depender de nomes diferentes de argumento para operações simples.

Listagens podem usar `AllowScopedCollectionPermissions()`. Esse decorator permite que uma concessão scoped abra uma coleção quando ainda não há alvo específico nos argumentos. O serviço responsável pela listagem deve filtrar os dados retornados com os alvos acessíveis.

## Frontend

O admin chama `/api/auth/permissions/evaluate` com `WORKSPACE_PERMISSION_EVALUATION_SET`. A resposta indica quais permissões o usuário possui de forma suficiente para montar abas, botões e mensagens de diagnóstico.

Essa avaliação não substitui a autorização do backend. Operações sobre registros específicos continuam sendo bloqueadas quando o escopo da concessão não cobre o alvo real.

O gerenciamento de concessões fica no painel de pessoas, na seção "Permissões do Event Manager". Essa UI usa presets, labels, ícones e resumos de dados incluídos do catálogo compartilhado.

## Adicionando uma permissão

Ao criar uma nova permissão:

1. Adicione a constante em `Permission`.
2. Inclua a permissão em `EVENT_MANAGER_PERMISSION_CATALOG`.
3. Adicione labels e ícones se ela aparecer no painel.
4. Documente dados incluídos quando a permissão expuser dados pessoais ou dados operacionais sensíveis.
5. Inclua a permissão em `WORKSPACE_TAB_PERMISSIONS`, `WORKSPACE_PERMISSION_EVALUATION_SET` ou presets apenas quando a UI precisar.
6. Marque como global-only se a permissão não puder ser avaliada com segurança em escopos de evento, grupo ou grande evento.
7. Proteja handlers com `RequirePermissions(...)`.
8. Garanta que a camada de autorização consegue resolver o alvo da operação.
9. Adicione testes para o catálogo, o guard, a camada de autorização e os resolvers ou controllers alterados.
10. Atualize stories quando a nova permissão afetar a UI de concessões ou permissões.

## Cuidados

Não trate checks de frontend como autorização.

Não adicione novos papéis de Keycloak para permissões de negócio sem mudar a arquitetura conscientemente.

Não conceda `event-manager#super-admin` para resolver falta de escopo em uma operação comum.

Não edite permissões antigas em migrações já aplicadas. Quando a mudança exigir alterações no banco de dados, crie uma nova migração.