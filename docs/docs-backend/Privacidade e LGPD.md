# Privacidade e LGPD

## Integração M2M

Os endpoints de LGPD são internos e exigem principal machine-to-machine válido.

Endpoints de exclusão exigem papel M2M `lgpd:delete`.

## Exportação

A exportação deve retornar dados pessoais do titular agrupados por categoria, sem incluir dados operacionais de eventos apenas por estarem relacionados ao titular. As seleções explícitas em `apps/backend/src/app/lgpd/lgpd-selects.ts` e os mapeadores de saída delimitam esse conteúdo. Consulte também o [guia do módulo LGPD](https://github.com/cacic-fct/event-manager/blob/main/apps/backend/src/app/lgpd/README.md).

Exemplos de cuidado:

- Certificados incluem somente `id`, `personId`, `issuedAt` e `deletedAt`, sem nomes, datas ou créditos de eventos e sem snapshots renderizados;
- Presenças não incluem coordenadas de coleta, método de criação nem detalhes operacionais do coletor;
- Comprovantes exportados não devem expor `objectKey`, texto de OCR, erros de processamento ou logs de validação;
- Logs de auditoria exportados não devem carregar snapshots brutos completos;
- Submissões off-line de presença, candidatos de mesclagem e ajustes de peso de sorteios não são categorias de exportação;
- Pessoas mescladas devem considerar origem e destino para não omitir histórico relevante.

## Exclusão programada

A exclusão programada remove ou marca como removidos os dados que não precisam ficar disponíveis na operação normal.

Ela deve preservar registros necessários para auditoria e para reversão.

## Exclusão definitiva

A exclusão definitiva remove o que ainda for deletável depois da etapa de retenção.

Antes de remover usuários ou pessoas, exclua dependências que bloqueiam chave estrangeira, como escopos e atribuições de cargos, participações em grupos de permissões, inscrições, presenças, certificados, comprovantes e registros de mesclagem.

Quando comprovantes possuem objetos em S3, o serviço deve localizar as chaves antes de remover os registros do banco.

Quando dados pessoais precisam permanecer apenas por rastreabilidade, prefira anonimizar identificadores diretos em vez de manter nome, e-mail, documento ou outros dados de contato.

## Objetos S3

Comprovantes e outros arquivos privados usam armazenamento compatível com S3.

O backend deve:

- Tratar falhas de remoção com log claro;
- Evitar apagar objetos antes de saber quais registros serão afetados.

Fluxos de LGPD precisam manter a ordem consistente entre banco e armazenamento. Se algum dos pontos falhar, a operação não deve presumir que a exclusão foi concluída.

## Auditoria

Logs de auditoria podem conter identificadores do titular dos dados nos campos de ator, entidade, snapshots, metadados ou campos alterados.

A anonimização de auditoria substitui valores sensíveis por um identificador derivado do pedido, como `anonymized:<requestId>`, e reindexa os logs alterados no Typesense quando a busca está ativa.

Não remova a auditoria inteira apenas para esconder dados pessoais. Prefira preservar o fato operacional e anonimizar o titular.

## Cookies e rastreamento

`apps/backend/src/app/privacy` centraliza integração com preferências de privacidade e cookies compartilhados do CACiC.

Não crie novos cookies de rastreamento sem passar por essa camada. Cookies compartilhados devem respeitar domínio, expiração e remoção coordenada entre aplicações CACiC.

## Cuidados de manutenção

Ao alterar privacidade ou LGPD:

- Teste exportação, exclusão programada e exclusão definitiva;
- Confira pessoas mescladas;
- Confira comprovantes e objetos S3;
- Confira submissões off-line;
- Confira logs de auditoria e reindexação;
- Não confie em checks de frontend como barreira de privacidade;
- Documente novos dados pessoais quando uma permissão ou endpoint passar a expor esses dados.
