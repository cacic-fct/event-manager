---
title: Conceitos gerais
---

O Event Manager mantém os mesmos eventos, pessoas e participações em duas interfaces. A diferença entre elas é a responsabilidade de quem está usando o sistema.

## Interface administrativa

A interface administrativa é a área de trabalho dos organizadores. Ela concentra cadastros, configurações, conferências, correções, revisões e operações com impacto coletivo.

O painel é pensado principalmente para computador e conexão estável. Em atividades de campo, como coleta de presença ou operação de uma partida, prefira a interface pública quando ela oferecer o fluxo necessário.

## Interface pública

A interface pública atende participantes, ministrantes, coletores de presença, representantes de equipe e oficiais de partidas.

Além da programação aberta, ela reúne os dados e as ações da pessoa autenticada: inscrições, pagamentos, carteira, participações, formulários, notificações, agenda do dia e tarefas operacionais autorizadas.

Uma pessoa pode executar uma responsabilidade limitada pela interface pública sem receber acesso amplo ao painel administrativo.

## Identidade e autorização

O Keycloak confirma a identidade e libera a entrada administrativa. O que a pessoa pode fazer dentro do Event Manager é definido pelos cargos, grupos, escopos e períodos de validade mantidos no próprio sistema.

O papel `access` permite entrar no painel. O papel `super-admin` ignora as restrições do sistema.

Leia [Permissões e recursos congelados](05-Interface%20administrativa/02-Permissões%20e%20recursos%20congelados.md) para entender o modelo completo.

## Pessoa e usuário

A pessoa representa o cadastro usado no sistema. O usuário representa a conta autenticada.

Os dois registros podem existir em momentos diferentes. Uma pessoa pode ser cadastrada antes de criar uma conta, e algumas responsabilidades podem ser preparadas antes desse vínculo. A conta passa a usar essas responsabilidades quando o vínculo e o acesso base estiverem disponíveis.

Leia [Pessoas x Usuários](Gerenciar%20pessoas/01-Pessoas%20x%20Usuários.md).

## Histórico dos dados

Várias exclusões usam *soft delete*: o registro deixa de participar do fluxo normal, mas permanece preservado para auditoria, restauração ou manutenção.

Por isso, **não** crie eventos, pessoas, inscrições ou certificados de teste no ambiente de produção. Faça experimentos em ambiente local ou de demonstração.

Um item antigo também pode ficar congelado. A correção continua possível para pessoas autorizadas, mas exige uma motivação explícita porque pode afetar inscrições, presenças, resultados ou certificados já consolidados.

## Dados locais e uso off-line

Algumas páginas guardam dados no dispositivo para consulta ou trabalho temporário sem conexão. Isso não significa que toda ação esteja disponível off-line.

Antes de uma operação em campo, abra o fluxo com internet, confirme a conta em uso e verifique se os dados necessários foram preparados. Depois, aguarde a confirmação de sincronização antes de fechar o navegador, trocar de conta ou limpar os dados do site.