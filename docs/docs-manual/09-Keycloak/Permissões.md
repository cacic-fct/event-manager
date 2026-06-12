# Permissões

As permissões administrativas são avaliadas a partir dos dados recebidos do Keycloak e da API de autorização.


No painel administrativo, a página de permissões mostra os acessos reconhecidos para o usuário logado. Ela é útil para diagnosticar problemas de acesso, mas não concede permissões.

Para alterar permissões, use o Keycloak ou solicite apoio da equipe responsável pela administração de acessos.

## Formato

As permissões seguem o formato:

```
recurso#ação
```

Exemplos:

- `event#read`;
- `event#edit`;
- `event#delete`.

## Recursos


{/*
  Referência: apps/admin/src/app/shared/services/workspace-permissions.service.ts
*/}

Recursos:
- `event`
- `major-event`
- `certificate`
- `event-attendance`
- `event-lecturer`
- `person`
- `merge-candidate`
- `subscription`
- `validate-receipt`
- `frozen`

## Ações

Ações:
- `read`
- `edit`
- `delete`

Nem todo recurso possui todas as ações. Algumas telas também exigem combinações de permissões, pois precisam consultar dados relacionados.

## Recursos congelados

Permissões de `frozen` permitem editar ou excluir registros antigos protegidos pelo sistema.

Conceda essas permissões apenas a administradores que precisam fazer correções históricas, pois alterações em recursos antigos podem afetar certificados, presenças e auditoria.
