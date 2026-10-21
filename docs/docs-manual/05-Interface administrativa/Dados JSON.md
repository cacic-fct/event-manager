---
title: Dados JSON
---

A área **Dados JSON** permite exportar e importar eventos, configurações e registros de participação, com revisão das alterações antes de salvar.

O arquivo contém os dados aceitos pelo formato e acessíveis à conta que fez a exportação. Ele não substitui um backup do sistema.

## Contexto e permissões

Escolha um evento, grupo de eventos ou grande evento para exportar. Quando a tela é aberta dentro de um contexto, esse contexto também limita a importação.

Na área geral, a seleção para exportação só limita a importação se você ativar essa opção. Os vínculos do arquivo são mantidos: selecionar outro contexto não move os registros para ele.

Exportar, importar e desfazer exigem permissões próprias, além das permissões sobre cada recurso. Inscrições e presenças exigem suas autorizações específicas. Recursos congelados continuam protegidos.

## Exportar

Escolha se deseja incluir os eventos e grupos filhos e as configurações relacionadas. Inscrições e presenças ficam desmarcadas por padrão e têm opções separadas para o contexto escolhido e seus filhos.

As opções de participação são independentes da inclusão da estrutura dos filhos. Por exemplo, é possível exportar presenças das atividades sem exportar seus cadastros.

Você também pode incluir o estado de publicação e os convites do público-alvo. Essas opções começam desativadas. Exportar convites exige permissão de atualização no evento, grupo ou grande evento.

Ao importar convites, as pessoas convidadas precisam existir no destino e a lista substitui todos os convites atuais. Se o arquivo omitir os convites ou o estado de publicação, os valores existentes são preservados. Novos eventos e grandes eventos sem estado de publicação começam como rascunho.

Confira os avisos de exportação: registros sem acesso podem ser omitidos. Arquivos com inscrições ou presenças contêm dados pessoais; guarde-os em local seguro.

## Preparar o arquivo

Comece pelo modelo JSON disponível na tela ou edite um arquivo exportado. O schema, também disponível para download, descreve os campos e limites aceitos.

| Conteúdo | Efeito ao importar |
| --- | --- |
| `id` existente | Atualiza o mesmo registro. Não permite trocar seu vínculo com o evento, grupo ou grande evento pai. |
| `key` local | Identifica um novo registro no arquivo. Outros registros podem usar essa chave para referenciá-lo. |
| Campo omitido | Preserva o valor atual. |
| `null` | Limpa o valor somente quando o campo aceita essa opção. |
| Lista informada | Substitui a lista ou seleção correspondente. |
| Recurso ausente | Não exclui o registro existente. |

O sistema compara os dados de pessoas com os cadastros existentes. Quando não encontra uma correspondência ou há dúvida, a revisão permite criar uma pessoa, mesclar com um dos cadastros sugeridos ou ignorar o registro. As opções dependem dos dados disponíveis e das permissões da conta.

Ao mesclar, o e-mail principal é mantido e o importado é acrescentado aos endereços secundários. Matrícula e documento não podem entrar em conflito. Uma inscrição pode corresponder a um vínculo já existente entre pessoa e evento, mesmo quando o arquivo usa uma chave local.

## Revisar e aplicar

1. Carregue o arquivo ou cole seu conteúdo;
1. Confira o contexto da importação;
1. Use **Revisar importação** e compare os valores atuais e propostos, incluindo efeitos em registros relacionados;
1. Resolva todas as pessoas pendentes e revise novamente;
1. Corrija as linhas bloqueadas. Se quiser aplicar somente as linhas liberadas, marque **Ignorar registros bloqueados** e revise novamente;
1. Use **Aplicar alterações**;
1. Confira o relatório e baixe o **JSON com IDs gerados** para futuras atualizações.

A revisão não salva alterações. Se o arquivo, os dados ou as permissões mudarem, será necessário revisar novamente. As reservas de IDs também expiram; a tela informa quando é preciso renovar a revisão.

Uma linha bloqueada também bloqueia as que dependem dela. Na aplicação parcial, somente os registros liberados são salvos, em uma única transação.

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

O histórico mostra as importações acessíveis à conta, com a identificação e o relatório de cada lote.

**Desfazer esta importação** reverte o lote inteiro. A ação exige permissão de reversão e as permissões atuais sobre todos os recursos afetados. Somente quem importou ou um superadministrador pode desfazer o lote.

A reversão é bloqueada se os registros afetados ou seus vínculos tiverem mudado depois da importação, ou se o esquema do banco ou o contrato de transferência tiver mudado. Nenhuma parte do lote é desfeita quando a conferência falha. Nesses casos, revise a correção pelas telas de cada recurso.

## Bilhetes e compras avulsas

A exportação de bilhetes inclui os titulares, a origem, as datas e a situação de cada bilhete. Ela começa desativada, exige permissão de leitura de bilhetes e independe das opções de inscrições e presenças. Comprovantes e o histórico completo de transferências ficam de fora.

Uma compra já paga fora do sistema pode ser importada como `ticket-purchase`. A compra é registrada como aprovada e emite o bilhete, sem exigir inscrição da pessoa no grande evento. O evento deve pertencer a um grande evento e ter bilhetes habilitados. A operação exige permissões de emissão de bilhetes e aprovação de comprovantes.

Bilhetes já emitidos podem ser reimportados como `event-ticket`. A importação identifica os titulares no destino; se o titular original for diferente do atual, seu cadastro precisa existir. O schema disponível na tela descreve os campos de bilhetes e compras.

Importar bilhetes exige permissão de emissão. Bilhetes revogados e trocas de titular também exigem as permissões dessas operações. Como uma compra já emite seu bilhete, não inclua outro bilhete ativo para a mesma pessoa e evento no arquivo.
