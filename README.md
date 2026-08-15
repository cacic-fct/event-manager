# CACiC Event Manager

[![Documentation](https://img.shields.io/badge/documentation-blue)](https://docs.eventos.cacic.com.br)
[![CI](https://img.shields.io/github/actions/workflow/status/cacic-fct/event-manager/ci.yml?branch=main&logo=github&label=ci)](https://github.com/cacic-fct/event-manager/actions)
[![CD](https://img.shields.io/github/actions/workflow/status/cacic-fct/event-manager/cd.yml?branch=main&logo=github&label=cd)](https://github.com/cacic-fct/event-manager/actions)
[![Docs build](https://img.shields.io/github/actions/workflow/status/cacic-fct/event-manager/docs.yml?branch=main&logo=github&label=docs%20build)](https://github.com/cacic-fct/event-manager/actions)
[![Coverage](https://img.shields.io/codecov/c/github/cacic-fct/event-manager/main?logo=codecov)](https://codecov.io/gh/cacic-fct/event-manager)
[![License](https://img.shields.io/badge/license-AGPL–3.0–only-red)](https://github.com/cacic-fct/event-manager/blob/main/License.txt)

O gerenciador de eventos do CACiC (também conhecido popularmente como "CACiC Eventos" ou historicamente como "FCT App") é um sistema para controle de inscrições, presenças e emissão de certificados de eventos.


## Contribuindo

Todos podem contribuir para o projeto.

Leia o [guia de contribuição do CACiC](https://github.com/cacic-fct/.github/blob/main/Contributing.md).

## Documentação

A documentação do projeto está disponível em [docs.eventos.cacic.com.br](https://docs.eventos.cacic.com.br).

O projeto da documentação está disponível na pasta `docs`.

## Aplicativo

O aplicativo é construído com Angular e pode ser acessado em [eventos.cacic.com.br/app/](https://eventos.cacic.com.br/app/).


### Desenvolvimento

Antes de começar, instale o [Bun](https://bun.sh/).

#### Iniciando o desenvolvimento

Instale as dependências do monorepo:

```bash
bun install
```

#### Serviços locais

O backend depende de PostgreSQL, Redis, Typesense e SeaweedFS. Para subir os serviços locais de desenvolvimento, use:

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

O SeaweedFS expõe a API S3 em `http://localhost:8333`. As credenciais de desenvolvimento
(`xyz`/`xyz`) e o bucket `event-manager` já estão definidos em `apps/backend/.env.example`.
Os dados enviados ficam em volumes Docker locais e não são rastreados pelo Git.

Este projeto usa o [Nx](https://nx.dev) para gerenciar o monorepo.

Para iniciar um aplicativo em modo de desenvolvimento, use:

```bash
bunx nx serve <projeto>
```

Projetos disponíveis:

```bash
bunx nx serve public
bunx nx serve admin
bunx nx serve backend
```

Também é possível executar outros comandos do Nx, como:

```bash
bunx nx build public
bunx nx storybook admin
```
