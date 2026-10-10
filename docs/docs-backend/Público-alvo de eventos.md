# Público-alvo de eventos

Eventos, grupos de eventos e grandes eventos têm uma regra própria de público-alvo, independentemente da inscrição, da publicação e dos critérios de presença ou certificado. Os registros anteriores à introdução desse recurso continuam públicos.

| Público | Critério |
| --- | --- |
| Público | Não acrescenta restrições de público-alvo. |
| Somente Unesp | E-mail principal ou secundário vinculado à conta com domínio `@unesp.br`. |
| Somente curso | E-mail Unesp, vínculo de graduação, código do curso na matrícula e confirmação da matrícula. Inicialmente, apenas `12` (Ciência da Computação) é reconhecido. |
| Somente pessoas convidadas | Convite associado ao registro de pessoa vinculado à conta. |

As regras dos níveis se acumulam. Um evento público dentro de um grande evento restrito continua sujeito ao público do grande evento. Um convite para um evento não concede automaticamente acesso ao grupo ou ao grande evento. É possível restringir uma atividade dentro de um grande evento público.

## Matrícula e contas vinculadas

O código do curso ocupa o terceiro e o quarto dígitos da matrícula, seguindo a identificação usada na carteira. A confirmação vem da claim assinada `unesp_role_verified`, mapeada pelo Account Manager a partir de `unespRoleVerified`. Os dados editáveis de pessoa no gerenciador de eventos não substituem essa confirmação.

Quando as claims não contêm os dados necessários de contas vinculadas, o backend consulta o Account Manager por gRPC e aceita apenas uma correspondência com o mesmo `userId`. A matrícula, o vínculo e a confirmação precisam pertencer à mesma afirmação de identidade. Falhas na consulta não concedem acesso restrito.

O cliente M2M de eventos precisa da role `users:read` no Account Manager para essa consulta. Os feeds privados também usam a consulta autenticada, sem confiar em e-mails editáveis de registros locais de pessoa.

A flag Unleash `cacic-undergraduate-unesp-role-verification-disabled` segue a semântica do Account Manager: quando ativada, dispensa a confirmação da graduação, mantendo a verificação de e-mail Unesp, vínculo e código do curso. O padrão é exigir confirmação. O cliente Unleash do backend precisa ter acesso a essa flag global.

Não há histórico de números de matrícula nem concessões baseadas em datas de observação. Caso a confirmação de matrícula dificulte a participação, os organizadores devem considerar o público **Somente Unesp**.

## Minhas participações

As regras atuais de público não apagam o histórico da pessoa. Atividades encerradas continuam em **Minhas participações** quando existe presença registrada como presente, inscrição, vínculo de ministrante ou certificado emitido para essa pessoa. Os registros de participação e gestão esportiva também preservam o respectivo grande evento encerrado. Isso cobre formatura, mudança de curso, perda do e-mail Unesp, remoção de convite e alterações de público nos níveis superiores.

A exceção é aplicada somente às leituras pessoais de histórico e seus detalhes/certificados. O catálogo, a busca e novas inscrições continuam sujeitos ao público atual. Interesse ou convite isolado não substituem um registro de participação. Ver o histórico de um grupo ou grande evento não libera atividades futuras nem atividades restritas nas quais a pessoa não participou.

## Administração e convites

A permissão global `event-audience#bypass` permite administrar recursos fora do público-alvo. Ela não substitui as permissões usuais de leitura, criação, atualização ou exclusão. Sem essa permissão, uma alteração que retire o próprio administrador do público é recusada integralmente.

Os convites são editados pelo componente compartilhado de busca de pessoas e persistidos na mesma transação da configuração do recurso. A lista de convidados exige permissão de atualização do respectivo recurso. Alterações na lista entram no registro de auditoria do recurso.

Um rascunho por convite pode começar vazio. Antes de publicar ou agendar, é necessário selecionar pelo menos uma pessoa convidada. A duplicação preserva a restrição de público, sem copiar automaticamente destinatários; duplicar um registro por convite exige a permissão de acesso fora do público-alvo.

As notificações usam o workflow Novu `audience-invitation`, configurável por `NOVU_AUDIENCE_INVITATION_WORKFLOW_IDENTIFIER`. Configure o workflow com `title`, `subject`, `body`, `actionLabel` e `actionUrl`; os dados também incluem `targetType`, `targetId` e `targetName`. A entrega só ocorre após a transação, para quem pode acessar o recurso e seus níveis superiores. A identificação da entrega inclui a data de criação do convite para distinguir uma nova inclusão após remoção.

Convites sem confirmação de entrega permanecem pendentes no próprio registro. A reconciliação verifica até 100 por rodada, com intervalo mínimo de cinco minutos entre tentativas e concorrência limitada. Recursos ainda não publicados ou indisponíveis ao destinatário aguardam uma tentativa futura. Fusões de contas e pessoas preservam os convites e seu estado de entrega; desfazer uma fusão restaura os vínculos movidos.

## Aplicação das regras

O interceptor de público estabelece o contexto de cada requisição. A extensão do Prisma aplica as restrições antes da paginação, inclusive nas relações e contagens. Transações mantêm o mesmo contexto. Recursos sem acesso não aparecem em listas e são tratados como inexistentes em consultas diretas.

Sitemaps e caches compartilhados usam somente conteúdo anônimo. Consultas destinadas aos caches públicos enviam `X-Event-Audience: public`, evitando que um cookie de sessão ainda não restaurado pela interface personalize uma resposta que será compartilhada. Os resultados personalizados não são persistidos nesses caches. As filas de presença off-line mantêm sua própria identificação de coletor e remetente.

A metadata de cardinalidade e propriedade das relações é gerada a partir do schema, pois o DMMF público do Prisma em execução não contém esses atributos. Após alterar relações do schema, execute `node tools/generate-audience-relations.mjs`. O teste de integridade recusa metadata desatualizada.

A migração `20260913200000_event_audiences` adiciona os públicos e as tabelas de convites. Sua aplicação exige a confirmação do responsável pelo banco, conforme as instruções do projeto.
