---
title: Níveis de acesso
---

O CACiC Event Manager usa um modelo de acesso em camadas. O Keycloak autentica a pessoa e libera a entrada no sistema, mas as permissões administrativas de negócio são concessões gravadas no próprio Event Manager.

Essa separação evita criar um cargo diferente para cada operação no Keycloak e permite conceder acessos temporários ou limitados a um evento, grupo de eventos ou grande evento.

## Camadas

| Camada | Onde é configurada | O que controla |
| --- | --- | --- |
| Conta autenticada | Keycloak | Identidade da pessoa, sessão e claims de perfil. |
| `access` | Client role do Keycloak | Entrada no Event Manager e no painel administrativo. |
| `super-admin` | Client role do Keycloak | Bypass administrativo para todas as permissões do Event Manager. |
| Concessões de permissão | Banco de dados do Event Manager | Operações administrativas como criar eventos, validar comprovantes, emitir certificados e gerenciar pessoas. |
| Regras de domínio | Backend do Event Manager | Restrições adicionais como recurso congelado, recurso removido, janela de coleta de presença e vínculo com o evento. |
| Papéis M2M | Keycloak | Endpoints internos de integração entre sistemas. Não devem ser usados para acesso humano ao painel. |

## Usuário comum

Usuários comuns podem acessar a interface pública, suas próprias informações e fluxos autenticados que não exigem permissão administrativa.

Uma pessoa pode existir no Event Manager sem possuir uma conta de usuário. Permissões administrativas só podem ser concedidas quando há um usuário vinculado.

## Administrador operacional

Um administrador operacional possui o client role `access` no Keycloak e uma ou mais concessões no Event Manager.

As concessões seguem o formato `recurso#ação`, como `event#read`, `subscription#import` ou `receipt#approve`. Cada concessão também possui um escopo:

- `Global`: vale para todo o Event Manager;
- `Grande evento`: vale para um grande evento específico;
- `Grupo de eventos`: vale para um grupo de eventos específico;
- `Evento`: vale para um evento específico.

A permissão efetiva depende da operação executada. Por exemplo, uma pessoa pode conseguir abrir a aba de inscrições porque possui alguma concessão de `subscription#read`, mas o backend ainda verifica se aquela inscrição pertence ao evento, grupo ou grande evento liberado.

## Super administrador

O client role `super-admin` é um bypass de emergência e manutenção. Ele não depende das concessões gravadas no banco e deve ser usado apenas por pessoas que realmente precisam operar qualquer parte do sistema.

Na rotina, prefira conceder permissões específicas no Event Manager. Isso preserva rastreabilidade, reduz o impacto de erros e permite limitar a validade do acesso.

## Responsabilidades típicas

O painel de pessoas oferece presets para responsabilidades comuns. Os presets são atalhos para várias permissões e não criam novos cargos permanentes.

- Administrador de grande evento: gerencia grande evento, eventos, inscrições, presenças, certificados e comprovantes no escopo escolhido.
- Validador de comprovantes: valida, rejeita e desfaz validações de comprovantes dentro de um grande evento.
- Coordenador de presenças: gerencia coleta, importação, ajustes e coletores de presença no escopo escolhido.
- Operador de certificados: configura, emite, reemite e remove certificados no escopo escolhido.
- Gestor de pessoas: gerencia pessoas e resolução de duplicidades. Esse acesso é sempre global.

Os presets podem mudar conforme o sistema evolui. A interface sempre mostra as permissões e os dados limitados incluídos antes de salvar a concessão.

## Acessos temporários

Toda concessão pode ter início e fim de validade. Use validade limitada quando o acesso estiver ligado a um evento, plantão, comissão temporária ou mandato.

Quando a validade expira, a concessão deixa de ser considerada pela autorização, mas continua registrada para histórico interno. Para revogar antes do prazo, remova a concessão no painel de pessoas.
