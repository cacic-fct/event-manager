# Notificações

O sistema usa notificações automáticas para avisar usuários sobre mudanças relevantes. Não existe ferramenta de envio manual em massa.

## Onde fica o código

Os principais pontos de manutenção são:

- `apps/backend/src/app/notifications`;
- `apps/backend/src/app/event-forms/event-form-notification.service.ts`;
- `apps/backend/src/app/event-forms/event-forms.scheduler.ts`;
- serviços de inscrição, certificado e presença que chamam `NovuNotificationsService`;
- `apps/public/src/app/tabs/notifications`;
- `apps/public/src/app/feature-flags/public-feature-flags.ts`.

## Novu

Novu é usado para inbox, push e disparos de workflows quando estiver configurado.

As variáveis principais são:

| Variável | Uso |
| --- | --- |
| `NOVU_SECURE_MODE_ENABLED` | Ativa sessões assinadas e disparos pelo backend. |
| `NOVU_SECRET_KEY` | Assina o `subscriberId` e autoriza disparos na API. |
| `NOVU_API_URL` | Endpoint da API Novu. |
| `NOVU_APPLICATION_IDENTIFIER` | Identificador usado pela inbox no navegador. |
| `NOVU_CLIENT_API_URL`, `NOVU_CLIENT_SOCKET_URL`, `NOVU_CLIENT_SOCKET_PATH` | Endpoints do SDK quando a instalação não usa os padrões. |
| `NOVU_PUSH_INTEGRATION_IDENTIFIER`, `NOVU_VAPID_PUBLIC_KEY` | Configuração de push. |

Quando o modo seguro não está ativo ou a configuração está incompleta, o backend deve falhar de forma controlada e não bloquear o fluxo principal.

## Identidade do assinante

O `subscriberId` deve ser estável.

Para pessoas vinculadas, o serviço prefere `userId` ou o usuário associado. Quando não houver usuário, pode usar e-mail ou o próprio registro de pessoa como fallback operacional.

Evite trocar a estratégia sem planejar migração, porque isso cria caixas de notificação separadas para a mesma pessoa.

## Workflows

Os workflows configuráveis incluem:

- alteração de status de inscrição em grande evento;
- presença off-line enviada para revisão;
- certificado disponível;
- formulário de evento disponível.

Os identificadores podem ser configurados por variável de ambiente. O valor padrão deve continuar compatível com os workflows criados no Novu.

## Disparo

Disparos devem ser idempotentes no serviço de domínio quando o evento de negócio puder repetir.

Exemplo: formulários de evento usam `lastNotifiedAt` no vínculo para evitar avisos duplicados. Se o Novu falhar, o vínculo volta ao estado não notificado para permitir nova tentativa.

## Falhas

Falhas de Novu não devem confirmar uma operação de negócio que não aconteceu, mas também não devem impedir fluxos principais quando a notificação é complementar.

O serviço deve registrar:

- falha HTTP;
- resposta não reconhecida;
- timeout;
- erro de configuração;
- destinatário sem identificador estável.

## Privacidade

Payloads de notificação devem conter somente o necessário para a mensagem.

Não inclua respostas de formulários, documentos, comprovantes, tokens de calendário, links privados ou dados sensíveis. Quando a pessoa precisar ver detalhes, envie apenas um link para uma tela autenticada.

## Interface pública

A aba de notificações do app público depende de autenticação, feature flag e sessão Novu válida.

Se a sessão não puder ser criada, a interface deve mostrar indisponibilidade sem vazar detalhes de configuração.
