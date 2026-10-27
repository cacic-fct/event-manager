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

Os identificadores são contratos versionados no catálogo `apps/backend/src/app/notifications/novu-workflow-identifiers.ts`. Development e Production devem publicar os mesmos identificadores; as credenciais selecionam o ambiente. Alterações nesses contratos devem atualizar o catálogo, os testes e os workflows no Novu em conjunto.
### Configuração dos templates

Cada workflow usa primeiro um passo **In-App** e depois um passo **Push**, com os provedores Novu Inbox e Firebase Cloud Messaging ativos no mesmo ambiente. Os workflows opcionais permitem que a pessoa altere suas preferências por canal.

Na API v2 do Novu, configure `preferences.workflow.all` com `enabled: true` e `readOnly: true` para esses workflows. Se houver um override em `preferences.user`, mantenha também `all.enabled: true` e `all.readOnly: true` nesse override. A resposta de consulta apresenta os valores padrão em `preferences.default`. Essa configuração marca o workflow como crítico e impede que preferências individuais ou globais suprimam os avisos obrigatórios. A entrega push ainda depende da permissão do navegador e de um dispositivo registrado.

A interface compartilhada mantém esses avisos fora da lista de preferências e respeita também `workflow.critical` enviado pelo Novu para outros workflows. A listagem usa o filtro padrão do SDK, que exclui workflows críticos; a proteção local também oculta os identificadores obrigatórios quando a configuração remota ainda não tiver sido aplicada. Mantenha essa configuração alinhada com a proteção local em `libs/shared-notifications-angular/src/lib/notification-preferences.ts`.

Mantenha a sanitização de conteúdo ativa. O schema deve exigir `title`, `body` e `redirectUrl`, além de `actionLabel` nos workflows com botão. Permita propriedades adicionais para os metadados específicos de cada notificação. Não configure `redirectUrl` como URI absoluta: o backend usa caminhos relativos do aplicativo.

Crie e valide os workflows em Development antes de sincronizá-los para Production. A publicação deve incluir apenas os workflows desejados, preservando os demais recursos do ambiente. Uma prévia valida o conteúdo, mas a verificação do caminho relativo exige consultar uma mensagem entregue a um assinante de teste. Use um assinante sintético sem tokens de dispositivo para verificar a caixa de entrada sem enviar push a pessoas reais.

## Disparo

Disparos devem ser idempotentes no serviço de domínio quando o evento de negócio puder repetir-se.

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

As notificações de informações para inscritos usam um identificador estável por evento e revisão. Novos avisos têm até cinco tentativas, com espera exponencial a partir de 30 segundos. Uma falha definitiva só pode ser reenviada por uma solicitação explícita da organização, após cinco minutos da última falha. Esse reenvio preserva o contador de tentativas e concede uma única tentativa adicional. Jobs pendentes, em processamento ou concluídos não são reenviados. O identificador de transação do Novu permanece estável para evitar duplicatas entre destinatários já notificados.

A aba de notificações do app público depende de autenticação, feature flag e sessão Novu válida.

Se a sessão não puder ser criada, a interface deve mostrar indisponibilidade sem vazar detalhes de configuração.
