---
title: Permissões e recursos congelados
---

As permissões administrativas controlam quais dados podem ser lidos, criados, atualizados, importados, validados, emitidos ou excluídos no painel administrativo.

O Keycloak libera a entrada no Event Manager, mas as permissões de negócio são concessões gravadas no próprio Event Manager. Isso permite conceder acessos globais, temporários ou restritos a um evento, grupo de eventos ou grande evento.

## Como a autorização funciona

Para uma ação administrativa ser autorizada, o sistema avalia camadas diferentes:

1. O usuário precisa estar autenticado.
2. O usuário precisa possuir `access` no cliente Keycloak do Event Manager ou `super-admin`.
3. Se não for super administrador, precisa possuir uma concessão ativa no Event Manager.
4. A concessão precisa cobrir a ação solicitada e o escopo do recurso.
5. O backend ainda aplica regras de domínio, como recurso removido, recurso congelado, janela de coleta de presença e vínculos com eventos.

A interface usa essas permissões para mostrar abas, botões e mensagens de acesso. Essa indicação ajuda o usuário, mas a decisão de segurança é sempre reavaliada no backend.

## Escopos de concessão

As concessões podem ter quatro escopos:

| Escopo | Uso principal |
| --- | --- |
| Global | Acesso a todos os registros cobertos pela permissão. Também é obrigatório para permissões que não fazem sentido em um evento específico, como gestão de pessoas, resolução de duplicidades e gestão de permissões. |
| Grande evento | Acesso ao grande evento escolhido e às operações associadas a ele. |
| Grupo de eventos | Acesso ao grupo escolhido e aos eventos associados quando a operação suporta esse vínculo. |
| Evento | Acesso a um evento específico. |

Ao validar uma operação, o backend resolve o alvo real do recurso. Uma inscrição, comprovante ou certificado pode ser ligado a um evento ou grande evento, e a concessão precisa cobrir esse alvo.

## Página de permissões

A página de permissões do painel é somente informativa. Ela mostra os acessos reconhecidos pela aplicação para o usuário logado e ajuda a diagnosticar problemas.

Ela não concede permissões. Para conceder, editar ou remover permissões, use o painel de pessoas.

## Permissões ausentes

Quando uma tela indicar permissões ausentes:

1. Confira se o usuário possui `access` no cliente Keycloak do Event Manager.
2. Confira se existe uma concessão ativa no Event Manager.
3. Confira se a validade da concessão já começou e ainda não expirou.
4. Confira se o escopo da concessão cobre o evento, grupo ou grande evento da operação.
5. Confira se a tela exige permissões relacionadas. Algumas abas precisam carregar eventos, pessoas, inscrições, comprovantes ou certificados ao mesmo tempo.

## Escopos

As permissões seguem o formato `recurso#ação`.

Exemplos:

- `event#read`;
- `event#create`;
- `event#update`;
- `event#delete`;
- `certificate#issue`;
- `receipt#approve`;
- `permission-grant#create`.

O catálogo de permissões é mantido no código compartilhado do Event Manager. A documentação não duplica a lista completa para evitar divergência.

Leia [Permissões](../09-Keycloak/Permissões.md) para entender o papel do Keycloak e [Concessão de permissões](../07-Procedimentos/Cargos/Concessão%20de%20permissões.md) para o procedimento operacional.

## Recursos congelados

Eventos, grupos e grandes eventos antigos podem ficar congelados para edição e exclusão. Em geral, isso protege registros encerrados há mais de dois meses.

Alterar um recurso congelado exige a permissão normal da operação e também uma permissão específica de `frozen`, como `frozen#update` ou `frozen#delete`.

Use essas permissões apenas para correções administrativas. Mudanças tardias podem afetar inscrições, presenças, comprovantes, certificados já emitidos e auditoria.
