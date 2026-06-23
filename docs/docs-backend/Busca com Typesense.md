# Busca com Typesense

O Typesense é utilizado como motor de busca textual para consultas de eventos, grandes eventos, grupos de eventos, pessoas, locais e modelos de certificado.

Ele não substitui o PostgreSQL como fonte de verdade. O banco relacional continua responsável pelas permissões, filtros de negócio, paginação final, integridade dos dados e exclusão lógica. O Typesense mantém apenas documentos de busca derivados dos registros ativos do banco.

As aplicações frontend não acessam o Typesense diretamente. Todas as buscas passam pelo backend GraphQL, que aplica autenticação, autorização e filtros antes de devolver os resultados. Isso evita expor a chave administrativa do Typesense no navegador e mantém as regras de permissão em um único lugar.

Em desenvolvimento, o serviço local é definido em `docker/docker-compose.dev.yml`, na porta `8108`, com a chave padronizada `xyz`. Em produção, o backend deve usar `https://typesense.cacic.dev.br` com uma chave real configurada no ambiente de implantação.

Se o Typesense estiver desativado, indisponível ou retornar erro, o backend registra a falha e volta para a busca comum no PostgreSQL. Esse fallback existe para manter o sistema utilizável, mas a experiência esperada de busca textual completa depende do Typesense estar saudável.

## Configuração local

Suba os serviços de desenvolvimento com:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

O serviço local de Typesense fica em `http://localhost:8108` e usa a chave padronizada `xyz`.

As variáveis esperadas no backend são:

```bash
TYPESENSE_ENABLED="true"
TYPESENSE_URL="http://localhost:8108"
TYPESENSE_API_KEY="xyz"
```

Em produção, use:

```bash
TYPESENSE_ENABLED="true"
TYPESENSE_URL="https://typesense.cacic.dev.br"
TYPESENSE_API_KEY="<chave-real>"
```

## Coleções indexadas

O backend cria e atualiza automaticamente as coleções necessárias na inicialização:

- `events`
- `major_events`
- `event_groups`
- `people`
- `place_presets`
- `certificate_templates`

Na inicialização, o backend reindexa os registros ativos dessas coleções. Registros com `deletedAt` preenchido não são enviados ao Typesense.

## Sincronização

Criações e atualizações de eventos, grandes eventos, grupos de eventos, pessoas e locais atualizam o documento correspondente no Typesense depois que a transação principal do banco termina.

Exclusões lógicas removem o documento de busca. Como o projeto usa soft delete, a linha continua no PostgreSQL, mas deixa de existir no índice de busca.

Quando um grande evento ou grupo de eventos muda, os eventos relacionados também são reindexados para manter os nomes associados atualizados no documento de busca.

## Fallback

Se `TYPESENSE_ENABLED` estiver `false`, se a configuração estiver incompleta ou se o Typesense estiver indisponível, o backend usa a busca comum via PostgreSQL.

Um resultado vazio do Typesense é tratado como resultado vazio real. O fallback só é usado quando o Typesense não está configurado ou falha durante a requisição.
