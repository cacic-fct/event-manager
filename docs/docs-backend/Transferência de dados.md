---
title: Transferência de dados
---

A transferência de dados usa um contrato JSON versionado, compartilhado pelo painel e pelo backend. O fluxo administrativo está descrito em [Dados JSON](/Manual/Interface%20administrativa/Dados%20JSON).

O schema de `libs/shared-data-transfer` define os recursos, campos e limites do formato. O README da biblioteca traz exemplos de arquivos e requisições.

## Contrato e identidade

O arquivo informa `format`, `version` e `resources`. Cada recurso tem um `kind`, dados editáveis em `data` e uma identidade: `id` para registros existentes ou `key` para novos registros. Referências a chaves locais usam a própria string, sem prefixo.

Omitir um campo preserva seu valor; `null` só limpa campos que aceitam nulidade. Listas informadas substituem a seleção correspondente. Recursos ausentes não são excluídos, e IDs existentes não permitem mudar o pai de um registro.

A prévia reserva IDs para as chaves locais e retorna um token vinculado à conta e ao arquivo. A reserva expira e é mantida em memória: um reinício do backend invalida reservas ainda não aplicadas.

Uma inscrição pode corresponder a um vínculo já existente entre pessoa e destino, mesmo quando informada com `key`. Presenças são identificadas pelo evento e pela pessoa. O resultado retorna as identidades resolvidas pelo servidor.

A identificação de pessoas usa as mesmas regras de normalização da importação CSV. Cadastros não encontrados ou ambíguos exigem revisão antes de aplicar o lote, inclusive em importações parciais. As decisões permitem criar uma pessoa, mesclar com um candidato ou ignorar o registro, conforme as permissões da conta. Pessoas e participações são gravadas na mesma transação, com registro para reversão e sincronização da busca.

## Revisão e transação

As operações REST ficam sob `/api/admin/data-transfer`. O Swagger documenta as requisições; os endpoints de schema, exportação, prévia, aplicação, histórico e reversão compartilham o mesmo contrato.

A prévia produz as diferenças, os bloqueios e um `planHash`. O hash inclui o arquivo, o escopo, as revisões dos registros e suas dependências. A aplicação recebe esse hash, o token de reserva quando houver chaves locais e um valor explícito para `allowPartial`.

O backend refaz o plano dentro da transação e recusa uma prévia desatualizada. Sem aplicação parcial, qualquer linha bloqueada impede o lote. Com aplicação parcial, dependências bloqueadas também são excluídas do plano executável; as regras agregadas são verificadas antes e depois das escritas. Todas as escritas escolhidas e seu diário são confirmados na mesma transação.

Alterações que uma configuração provoca nos filhos também entram na prévia e no controle de revisões. Cada filho é escrito uma única vez, mesmo quando aparece no arquivo junto da configuração que o altera.

O resultado contém um documento com IDs definitivos e os valores relidos após as regras de domínio, incluindo normalizações e padrões. Use esse documento em atualizações posteriores.

## Autorização

As permissões de transferência liberam a operação, mas não substituem a leitura e a escrita de cada recurso. O backend resolve o escopo real das linhas e verifica recursos congelados. IDs e escopos enviados no arquivo não concedem acesso.

Uma importação com escopo limita os destinos; ela não remapeia os vínculos do arquivo. Locais continuam globais: podem acompanhar um arquivo esportivo como dependências sem alterações, mas sua criação ou edição exige importação sem escopo e permissões globais de locais.

Exportar participação exige seleção explícita e autorização de leitura. Importar inscrições ou presenças exige as permissões correspondentes e as regras de domínio, inclusive operação de partida quando a presença iniciar o check-in esportivo.

## Repetição após resposta perdida

Se a aplicação foi confirmada no banco e a resposta se perdeu, repita a mesma requisição autenticada com o mesmo arquivo, escopo, `personDecisions`, `planHash`, `allowPartial` e token de reserva. O diário reconhece a solicitação e retorna o resultado persistido sem novas escritas, mesmo após reinício ou expiração da reserva.

Alterar a requisição inicia outra tentativa. Um lote desfeito não pode ser recuperado como se ainda estivesse aplicado. Solicitações idênticas concorrentes são serializadas antes de resolver novas chaves.

O painel mantém a requisição pendente e bloqueia a troca de arquivo ou contexto enquanto o resultado é incerto. A verificação reenvia a mesma requisição.

## Diário, reversão e sincronização

O diário persistido na auditoria registra as mutações, o resultado normalizado e a identificação da requisição. Seus dados internos de reversão não são retornados pelo histórico público dos lotes.

A reversão exige o autor da importação ou um superadministrador, a permissão de desfazer e as autorizações atuais de todos os recursos. Ela compara o esquema do banco e de transferência, os valores posteriores à importação e as referências criadas antes de restaurar o lote em uma única transação. Alterações posteriores bloqueiam toda a reversão.

A sincronização com busca, catálogos e notificações ocorre após a confirmação. O diário mantém as pendências para novas tentativas, inclusive após reinício, sem reaplicar os dados importados.

## Evolução do formato

Os testes de contrato verificam nomes, tipos e nulabilidade contra os tipos de domínio. Novos campos do domínio só entram no formato quando adicionados ao schema de transferência.

Novos recursos precisam participar da exportação, prévia, aplicação, diário e reversão, incluindo a resolução de referências e as permissões de cada operação. Efeitos após a confirmação precisam ser recuperáveis pelo diário. Os testes de integração do backend verificam atomicidade, recuperação e repetição após reinício.
