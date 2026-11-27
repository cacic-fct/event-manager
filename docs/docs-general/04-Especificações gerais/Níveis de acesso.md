---
title: Níveis de acesso
---

O CACiC Event Manager separa autenticação, responsabilidades administrativas e regras de domínio. O Keycloak autentica a conta e libera a entrada; cargos e grupos no Event Manager definem o que a pessoa pode fazer, onde e por quanto tempo.

## Camadas

| Camada | Onde é configurada | O que controla |
| --- | --- | --- |
| Conta autenticada | Keycloak | Identidade, sessão e claims de perfil. |
| `access` | Client role do Keycloak | Entrada administrativa, sem conceder as operações de negócio. |
| `super-admin` | Client role do Keycloak | Bypass das permissões administrativas do Event Manager. |
| Cargos, atribuições e grupos | Event Manager | Permissões efetivas, escopos e validade. |
| Regras de domínio | Backend do Event Manager | Público-alvo, publicação, recursos congelados, exclusão e elegibilidade. |
| Papéis M2M | Keycloak | Integrações entre sistemas; não substituem cargos humanos. |

## Pessoa e conta

Uma pessoa pode existir sem conta vinculada. É possível preparar suas atribuições antecipadamente; o acesso só funciona quando houver uma conta associada de forma válida e entrada administrativa liberada no Keycloak.

Usuários comuns acessam a interface pública e seus fluxos autorizados sem precisar de cargo administrativo. Vínculo com o evento, público-alvo e elegibilidade continuam sendo avaliados pelo backend.

## Responsabilidades administrativas

Um cargo reúne permissões no formato `recurso#ação`, como `event#read` ou `receipt#approve`. Ele pode herdar outro cargo. Uma atribuição liga o cargo a uma pessoa ou a um grupo de permissões; a participação em grupos também pode ter validade própria.

O alcance da atribuição é limitado por um ou mais escopos:

- Global;
- Grande evento;
- Grupo de eventos;
- Evento.

A interface **Permissões > Minhas permissões** mostra o resultado dos cargos diretos, grupos, herança e escopos ativos. Conseguir abrir uma aba não significa poder operar todos os seus registros: o backend verifica o alvo de cada ação.

## Conceder acesso

Use **Permissões > Gerenciamento de permissões**. Escolha ou crie um cargo, atribua a pessoa ou grupo e limite os alvos e a validade. Cargos predefinidos e modelos ajudam a começar; revise as permissões e os dados incluídos antes de salvar.

Use herança para relações duradouras entre responsabilidades. Use grupos para equipes recorrentes. Não replique o catálogo de operações em papéis do Keycloak.

O cargo predefinido de superadministrador é uma representação de acesso externo e não pode ser atribuído nessa tela. O client role `super-admin` deve ficar restrito a responsabilidades irrestritas de manutenção ou emergência.

## Validade e encerramento

A atribuição, cada escopo e a participação em grupo podem expirar independentemente. Quando a validade termina, aquela relação deixa de produzir acesso, mas permanece disponível no histórico.

Para retirar uma responsabilidade específica, remova a atribuição, a participação ou o escopo correspondente. Arquivar um cargo personalizado também arquiva suas atribuições ativas e vínculos em que ele é herdado; arquivar um grupo arquiva suas participações. Outros caminhos de acesso podem continuar ativos.

Consulte [Concessão de permissões](/Manual/Procedimentos/Cargos/Concess%C3%A3o%20de%20permiss%C3%B5es) para o procedimento e [Autorização e permissões](/Backend/Autoriza%C3%A7%C3%A3o%20e%20permiss%C3%B5es) para a implementação.
