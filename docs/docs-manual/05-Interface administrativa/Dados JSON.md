---
title: Dados JSON
---

A área **Dados JSON** permite exportar e importar estruturas de eventos, configurações e registros de participação. Use-a para preparar cadastros ou revisar alterações em lote.

O arquivo não é um backup completo do sistema. Ele contém somente os dados aceitos pelo formato e permitidos para a conta que fez a exportação.

## Contexto e permissões

Escolha um evento, grupo de eventos ou grande evento para exportar. Quando a tela é aberta dentro de um contexto, esse contexto também limita a importação.

Na área geral, escolher um contexto para exportação não limita automaticamente a importação. Para isso, marque **Aplicar aos registros existentes do contexto escolhido acima**. Essa opção limita os registros alcançados; ela não move os recursos do arquivo para outro evento.

Exportar, importar e desfazer exigem permissões próprias, além das permissões sobre cada recurso. Inscrições e presenças exigem suas autorizações específicas. Recursos congelados continuam protegidos.

## Exportar

Escolha se deseja incluir os eventos e grupos filhos e as configurações relacionadas. Inscrições e presenças ficam desmarcadas por padrão e têm opções separadas para o contexto escolhido e seus filhos.

As opções de participação são independentes da inclusão da estrutura dos filhos. Por exemplo, é possível exportar presenças das atividades sem exportar seus cadastros.

As opções `includePublishingState` e `includeAudienceInvitations` começam desativadas. Quando selecionadas, incluem, respectivamente, o estado e as datas de publicação de eventos e grandes eventos e as listas `invitationPersonIds` dos recursos exportados. Exportar convites exige permissão de atualização em cada evento, grupo ou grande evento. Os IDs das pessoas convidadas devem existir no destino. Na importação, uma lista informada substitui todos os convites; campos omitidos preservam os valores atuais, e novos recursos sem estado de publicação começam como rascunho.

Confira os avisos de exportação: registros sem acesso podem ser omitidos. Guarde os arquivos com inscrições ou presenças como dados pessoais.

## Preparar o arquivo

Use **Baixar modelo JSON** para começar um cadastro ou edite um arquivo exportado. **Baixar schema JSON** fornece o contrato aceito pelo sistema, incluindo campos e limites. Não acrescente campos que não estejam nesse contrato.

| Conteúdo | Efeito ao importar |
| --- | --- |
| `id` existente | Atualiza o mesmo registro. Não permite trocar seu vínculo com o evento, grupo ou grande evento pai. |
| `key` local | Identifica um novo registro no arquivo. Outros registros podem usar essa chave para referenciá-lo. |
| Campo omitido | Preserva o valor atual. |
| `null` | Limpa o valor somente quando o campo aceita essa opção. |
| Lista informada | Substitui a lista ou seleção correspondente. |
| Recurso ausente | Não exclui o registro existente. |

Os dados de pessoas são cruzados com os cadastros existentes antes da importação. Pessoas não encontradas exigem confirmação para criar ou a escolha de ignorar. Quando o nome corresponde a um cadastro, mas outro dado difere, revise manualmente: crie outra pessoa, mescle com uma pessoa apresentada ou ignore. Para criar, são necessários nome completo e matrícula, documento, e-mail ou telefone completo em formato internacional E.164 (ou número brasileiro com DDD), além das permissões globais de leitura e criação de pessoas. Para mesclar, são necessárias leitura e atualização de pessoas. O e-mail principal é preservado e o importado é acrescentado aos endereços secundários; matrícula e documento existentes devem ser compatíveis. Uma inscrição pode corresponder ao vínculo já existente entre pessoa e evento, mesmo quando o arquivo usa uma chave local.

## Revisar e aplicar

1. Carregue o arquivo ou cole seu conteúdo;
1. Confira o contexto da importação;
1. Use **Revisar importação** e compare os valores atuais e propostos, incluindo efeitos em registros relacionados;
1. Resolva todas as pessoas pendentes e use **Revisar importação** novamente. Nada será salvo até aplicar o plano completo;
1. Corrija as linhas bloqueadas. Se quiser aplicar somente as linhas liberadas, marque **Ignorar registros bloqueados** e revise novamente;
1. Use **Aplicar alterações**;
1. Confira o relatório e baixe o **JSON com IDs gerados** para futuras atualizações.

A revisão não salva alterações. Se o arquivo, os dados ou as permissões mudarem, será necessário revisar novamente. As reservas de IDs também expiram; a tela informa quando é preciso renovar a revisão.

Uma linha bloqueada pode bloquear outras que dependem dela. A aplicação parcial não força esses vínculos nem ignora as regras de negócio; somente os registros liberados são gravados, em uma única transação.

:::warning[Aviso]

Alterações em recursos publicados entram em vigor sem uma nova etapa de publicação. Confira datas, preços, inscrições e configurações antes de aplicar.

Arquivos de cadastro com apenas chaves locais podem criar novos recursos em uma nova importação. Para atualizar o mesmo cadastro depois, use o JSON retornado com os IDs definitivos.

:::

### Limites do formato

O formato não transfere comprovantes, códigos de presença on-line, resultados de partidas nem operações esportivas.

Para importar presença em uma partida nova, crie a partida primeiro e importe suas presenças em outro arquivo. Para renomear uma faixa de pagamento e alterar referências ao seu nome em inscrições ou certificados, faça a renomeação antes de importar as referências atualizadas.

Locais são recursos globais. Um local existente pode acompanhar uma importação esportiva limitada a um contexto, sem alterações. Para criar ou editar o local, use a área geral sem limitar a importação a um evento, com as permissões globais correspondentes.

## Falha de conexão

Se o envio falhar sem confirmar o resultado, mantenha a tela aberta e use **Verificar resultado / tentar novamente**. A ação reutiliza a solicitação enviada e recupera o resultado se a importação já tiver sido salva.

Não inicie outra importação do mesmo cadastro enquanto o resultado estiver incerto. O arquivo e o contexto ficam protegidos durante a verificação, e a tela avisa antes de sair.

Uma importação salva pode continuar com sincronização pendente. Nesse caso, o sistema tenta atualizar a busca e as notificações novamente; isso não exige repetir a importação.

## Histórico e reversão

O histórico apresenta os lotes acessíveis à conta. Guarde a identificação do lote e o relatório para conferência ou suporte.

**Desfazer esta importação** reverte o lote inteiro. A ação exige permissão de reversão e as permissões atuais sobre todos os recursos afetados. Somente quem importou ou um superadministrador pode desfazer o lote.

A reversão é bloqueada se os registros afetados ou seus vínculos tiverem mudado depois da importação, ou se o esquema do banco ou o contrato de transferência tiver mudado. Nenhuma parte do lote é desfeita quando a conferência falha. Nesses casos, revise a correção pelas telas de cada recurso.

## Bilhetes e compras avulsas

A opção **Incluir bilhetes** exporta os bilhetes dos eventos do contexto selecionado, incluindo os ativos, consumidos e revogados, com o titular atual, o titular original, a origem e as datas. A opção começa desmarcada e exige permissão de leitura de bilhetes. Ela funciona independentemente das opções de inscrições e presenças. Comprovantes e o histórico completo de transferências não são incluídos.

Para importar uma compra já paga fora do sistema, use `ticket-purchase` com `eventId`, `person`, `amountCents` e `purchasedAt`. A compra é registrada como aprovada e o bilhete é emitido na mesma operação, sem exigir inscrição da pessoa no grande evento. O evento deve pertencer a um grande evento e ter a configuração de bilhetes habilitada. A criação ou mesclagem de uma pessoa exige a mesma revisão manual dos demais registros. São necessárias as permissões de emissão de bilhetes e aprovação de comprovantes.

Os registros `event-ticket` representam os bilhetes emitidos e podem ser reimportados. A exportação identifica o titular original por `originalHolder`, com dados portáveis como nome e e-mail. A importação encontra seu cadastro no destino e recalcula a chave de origem dos bilhetes derivados de inscrição. Se o titular original for diferente do atual, seu cadastro já deve existir e corresponder a uma única pessoa. Quando os dois usam a mesma referência, a criação revisada do titular atual também vale para o original. Arquivos antigos podem informar `originalHolderPersonId` com um ID do destino; não use os dois campos juntos.

A emissão exige permissão de emissão de bilhetes. A permissão de revogação é exigida ao criar um bilhete revogado ou mudar seu estado para revogado. A troca de titular, inclusive na criação de um bilhete já transferido, exige gerenciar transferências. Uma compra em `ticket-purchase` já emite seu próprio bilhete; não inclua outro bilhete ativo para a mesma pessoa e evento no arquivo.
