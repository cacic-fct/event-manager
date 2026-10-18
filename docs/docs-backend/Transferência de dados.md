---
title: Transferência de dados
---

A transferência de dados usa um contrato JSON versionado, compartilhado pelo painel e pelo backend. O fluxo administrativo está descrito em [Dados JSON](/Manual/Interface%20administrativa/Dados%20JSON).

O schema de `libs/shared-data-transfer` é a fonte de verdade para os tipos de recurso, campos, nulabilidade e limites. Consulte o README da biblioteca para exemplos de arquivos e requisições. Não mantenha uma cópia do schema na documentação.

## Contrato e identidade

O arquivo informa `format`, `version` e `resources`. Cada recurso tem um `kind`, dados editáveis em `data` e uma identidade: `id` para registros existentes ou `key` para novos registros. Referências a chaves locais usam a própria string, sem prefixo.

Omitir um campo preserva seu valor; `null` só limpa campos que aceitam nulidade. Listas informadas substituem a seleção correspondente. Recursos ausentes não são excluídos, e IDs existentes não permitem mudar o pai de um registro.

A prévia reserva IDs para as chaves locais e retorna um token vinculado à conta e ao arquivo. A reserva expira e é mantida em memória: um reinício do backend invalida reservas ainda não aplicadas.

Inscrições podem resolver para um vínculo pessoa/destino existente. Presenças têm identidade composta por evento e pessoa. Por isso, use as identidades resolvidas pelo servidor, sem presumir que todo recurso com `key` gerará um novo registro. O matcher reutiliza a normalização dos imports CSV e verifica todos os identificadores. A prévia pode retornar `personPrompts`; `personDecisions` registra escolhas explícitas de criar, mesclar com um candidato existente ou ignorar. Criação exige nome completo, outro identificador e `Person.Read`/`Person.Create` globais; mesclagem exige `Person.Read`/`Person.Update` e reutiliza a regra de e-mails secundários existente. Identificadores conflitantes continuam bloqueados. Pessoas pendentes impedem qualquer aplicação, inclusive parcial. O plano é recalculado antes da primeira escrita; pessoas e participações são gravadas na mesma transação e registradas no diário reversível e na sincronização durável de busca. Desfazer criação exige `Person.Delete`; desfazer mesclagem exige `Person.Update`.

## Revisão e transação

As operações REST ficam sob `/api/admin/data-transfer`. O Swagger documenta as requisições; os endpoints de schema, exportação, prévia, aplicação, histórico e reversão compartilham o mesmo contrato.

A prévia produz as diferenças, os bloqueios e um `planHash`. O hash inclui o arquivo, o escopo, as revisões dos registros e suas dependências. A aplicação recebe esse hash, o token de reserva quando houver chaves locais e um valor explícito para `allowPartial`.

O backend refaz o plano dentro da transação e recusa uma prévia desatualizada. Sem aplicação parcial, qualquer linha bloqueada impede o lote. Com aplicação parcial, dependências bloqueadas também são excluídas do plano executável; as regras agregadas são verificadas antes e depois das escritas. Todas as escritas escolhidas e seu diário são confirmados na mesma transação.

Configurações que produzem alterações nos filhos devem incluí-las na prévia e no controle de revisões. Um filho aplicado pelo recurso proprietário não pode ser escrito novamente como uma operação independente.

O resultado contém um documento com IDs definitivos e os valores relidos após as regras de domínio, incluindo normalizações e padrões. Use esse documento em atualizações posteriores.

## Autorização

As permissões de transferência liberam a operação, mas não substituem a leitura e a escrita de cada recurso. O backend resolve o escopo real das linhas e verifica recursos congelados. IDs e escopos enviados no arquivo não concedem acesso.

Uma importação com escopo limita os destinos; ela não remapeia os vínculos do arquivo. Locais continuam globais: podem acompanhar um arquivo esportivo como dependências sem alterações, mas sua criação ou edição exige importação sem escopo e permissões globais de locais.

Exportar participação exige seleção explícita e autorização de leitura. Importar inscrições ou presenças exige as permissões correspondentes e as regras de domínio, inclusive operação de partida quando a presença iniciar o check-in esportivo.

## Repetição após resposta perdida

Se a aplicação foi confirmada no banco e a resposta se perdeu, repita a mesma requisição autenticada com o mesmo arquivo, escopo, `personDecisions`, `planHash`, `allowPartial` e token de reserva. O diário reconhece a solicitação e retorna o resultado persistido sem novas escritas, mesmo após reinício ou expiração da reserva.

Alterar a requisição inicia outra tentativa. Um lote desfeito não pode ser recuperado como se ainda estivesse aplicado. Solicitações idênticas concorrentes são serializadas antes de resolver novas chaves.

O painel mantém a requisição pendente enquanto o resultado é incerto. Ao alterar esse fluxo, preserve a verificação pelo reenvio exato e a proteção contra troca de arquivo ou contexto.

## Diário, reversão e sincronização

O diário persistido na auditoria registra as mutações, o resultado normalizado e a identificação da requisição. Seus dados internos de reversão não são retornados pelo histórico público dos lotes.

A reversão exige o autor da importação ou um superadministrador, a permissão de desfazer e as autorizações atuais de todos os recursos. Ela compara o esquema do banco e de transferência, os valores posteriores à importação e as referências criadas antes de restaurar o lote em uma única transação. Alterações posteriores bloqueiam toda a reversão.

A sincronização com busca, catálogos e notificações ocorre após a confirmação. O diário mantém as pendências para novas tentativas, inclusive após reinício. Uma falha de sincronização não deve provocar nova aplicação dos dados. Novos efeitos precisam ser recuperáveis pelo diário, além de seus callbacks em memória.

## Evolução do formato

Adicione campos ao schema somente quando sua transferência for intencional. Os contratos verificam nomes, tipos e nulabilidade contra os tipos de domínio; campos novos no domínio não passam a ser transferíveis automaticamente.

Ao acrescentar um recurso ou efeito, cubra exportação, resolução de referências, permissões, prévia, aplicação, leitura normalizada do resultado, diário, reversão e recuperação. Use os testes de contrato da biblioteca e a integração de transferência do backend para verificar atomicidade e repetição após reinício.
