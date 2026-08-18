---
title: Permissões
---

O Keycloak autentica a conta e controla a entrada administrativa. O Event Manager controla as responsabilidades de negócio.

Não replique no Keycloak o catálogo de permissões do Event Manager.

## Papéis humanos no Keycloak

| Papel | Finalidade |
| --- | --- |
| `access` | Libera a entrada no painel administrativo. Não define o que a pessoa pode fazer, apenas que ela pode acessar o painel. |
| `super-admin` | Ignora as restrições normais do Event Manager.  |

Contas de serviço podem usar papéis próprios para integrações. Eles não devem ser concedidos a pessoas para substituir cargos administrativos.

## Onde definir a responsabilidade

Use **Permissões > Gerenciamento de permissões** no painel administrativo.

Nesse workspace, cargos reúnem permissões, atribuições ligam cargos a pessoas ou grupos, escopos limitam os dados e datas controlam a validade.

Uma pessoa pode receber uma atribuição antes de possuir conta. O acesso só se torna utilizável quando o cadastro estiver vinculado a uma conta e essa conta tiver a entrada administrativa necessária.

## Por que não usar papéis de negócio no Keycloak

O Event Manager precisa avaliar o alvo real de cada operação.

A mesma pessoa pode administrar um evento, somente consultar outro e não ter acesso a um terceiro. Um papel global no provedor de identidade não representa essa diferença de forma adequada.

O catálogo técnico segue o formato `recurso#ação`, mas deve ser mantido no código e apresentado pela interface, não duplicado em uma lista manual.

## Diagnóstico

Quando uma pessoa não consegue executar uma ação, separe as perguntas:

1. Ela consegue autenticar?;
2. Possui `access` para entrar?;
3. A conta está vinculada à pessoa correta?;
4. Recebeu um cargo ou grupo ativo?;
5. O escopo cobre o recurso?;
6. A validade está em vigor?;
7. O recurso exige autorização para dados congelados?

Não conceda `super-admin` antes de localizar qual camada está faltando.

Leia [Concessão de permissões](../07-Procedimentos/Cargos/Concessão%20de%20permissões.md) e [Permissões e recursos congelados](../05-Interface%20administrativa/02-Permissões%20e%20recursos%20congelados.md).
