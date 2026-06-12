---
title: Permissões e recursos congelados
---

As permissões administrativas controlam quais dados podem ser lidos, editados ou excluídos.

Algumas telas precisam consultar mais de um tipo de dado. Por isso, um administrador pode ter acesso parcial a uma área, mas ainda encontrar bloqueios para carregar ou alterar informações.

## Permissões ausentes

Quando uma tela indicar permissões ausentes, solicite a permissão correta no Keycloak.

A página de permissões do painel é somente informativa. Ela mostra os acessos reconhecidos pela aplicação e os valores brutos recebidos do sistema de autenticação.

## Escopos

As permissões seguem o formato `recurso#ação`.

Exemplos:

- `event#read`;
- `event#edit`;
- `event#delete`;
- `certificate#edit`;
- `validate-receipt#edit`.

Leia [Permissões](../09-Keycloak/Permissões.md) para consultar os recursos usados pelo sistema.

## Recursos congelados

Eventos, grupos e grandes eventos antigos podem ficar congelados para edição e exclusão. Em geral, isso protege registros encerrados há mais de dois meses.

Alterar um recurso congelado exige permissões específicas de `frozen`.

Use essas permissões apenas para correções administrativas. Mudanças tardias podem afetar inscrições, presenças, comprovantes e certificados já emitidos.
