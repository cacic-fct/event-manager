# Permissões

O Keycloak autentica usuários e concede papéis de entrada no Event Manager. As permissões administrativas de negócio são avaliadas pelo próprio Event Manager a partir de concessões gravadas no banco de dados.

Não crie papéis de Keycloak para permissões como `event#read`, `subscription#import` ou `receipt#approve`. Essas permissões pertencem ao catálogo do Event Manager e devem ser concedidas pelo painel de pessoas.

## Papéis usados no Keycloak

| Papel | Uso |
| --- | --- |
| `event-manager#access` | Libera a entrada no Event Manager. Sem esse papel, o usuário não deve acessar operações administrativas, mesmo que existam concessões no banco. |
| `event-manager#super-admin` | Bypass administrativo. Autoriza todas as permissões do Event Manager e deve ser restrito a poucos responsáveis. |
| Papéis M2M | Usados por contas de serviço em endpoints internos, como integrações de LGPD, votação, perfil ou mesclagem de contas. Não substituem permissões humanas do painel. |

O papel `event-manager#access` é a porta de entrada. O que a pessoa pode fazer depois disso depende das concessões do Event Manager, exceto quando ela possui `event-manager#super-admin`.

## Onde alterar permissões

Use o painel administrativo:

1. Acesse a "Área Restrita".
2. Abra "Pessoas".
3. Selecione a pessoa com usuário vinculado.
4. Edite a seção "Permissões do Event Manager".

Veja o procedimento completo em [Concessão de permissões](../07-Procedimentos/Cargos/Concessão%20de%20permissões.md).

## Página de diagnóstico

No painel administrativo, a página de permissões mostra os acessos reconhecidos para o usuário logado. Ela é útil para diagnosticar problemas, mas não concede permissões.

A avaliação dessa página considera as concessões ativas do Event Manager. Para operações sobre recursos específicos, o backend revalida o escopo no momento da ação.

## Formato

As permissões do Event Manager seguem o formato:

```
recurso#ação
```

Exemplos:

- `event#read`;
- `event#create`;
- `event#update`;
- `event#delete`.

O catálogo completo fica no código compartilhado do Event Manager, em `libs/shared-permissions`. A interface administrativa usa esse catálogo para montar grupos, rótulos, presets e mensagens de dados incluídos.

Nem todo recurso possui todas as ações. Algumas telas também exigem combinações de permissões, pois precisam consultar dados relacionados.

## Recursos congelados

Permissões de `frozen` permitem editar ou excluir registros antigos protegidos pelo sistema.

Conceda essas permissões apenas a administradores que precisam fazer correções históricas, pois alterações em recursos antigos podem afetar certificados, presenças, inscrições, comprovantes e auditoria.

## Solução de problemas

Se uma pessoa não consegue acessar uma tela:

- Confirme se ela possui `event-manager#access` no Keycloak;
- Confirme se ela não depende de `event-manager#super-admin` por engano;
- Confirme se existe concessão ativa no painel de pessoas;
- Confira se a validade da concessão não expirou;
- Confira se o escopo da concessão cobre o evento, grupo ou grande evento acessado;
- Confira se a tela exige permissões de dados relacionados, como leitura de eventos ou pessoas.
