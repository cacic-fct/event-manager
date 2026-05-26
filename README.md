# CACiC Event Manager

[![Documentation](https://img.shields.io/badge/documentation-blue)](https://docs.fctapp.cacic.dev.br)
[![CI](https://img.shields.io/github/actions/workflow/status/cacic-fct/event-manager/ci.yml?branch=main&logo=github&label=ci)](https://github.com/cacic-fct/event-manager/actions)
[![CD](https://img.shields.io/github/actions/workflow/status/cacic-fct/event-manager/cd.yml?branch=main&logo=github&label=cd)](https://github.com/cacic-fct/event-manager/actions)
[![Docs build](https://img.shields.io/github/actions/workflow/status/cacic-fct/event-manager/docs.yml?branch=main&logo=github&label=docs%20build)](https://github.com/cacic-fct/event-manager/actions)
[![Coverage](https://img.shields.io/codecov/c/github/cacic-fct/event-manager/main?logo=codecov)](https://codecov.io/gh/cacic-fct/event-manager)
[![License](https://img.shields.io/badge/license-AGPL–3.0–only-red)](https://github.com/cacic-fct/event-manager/blob/main/License.txt)

O gerenciador de eventos do CACiC (também conhecido como "FCT App") é um sistema para controle de inscrições, presenças e emissão de certificados de eventos.


## Contribuindo

Todos podem contribuir para o projeto.

Leia o [guia de contribuição do CACiC](https://github.com/cacic-fct/.github/blob/main/Contributing.md).

## Documentação

A documentação do projeto está disponível em [docs.fctapp.cacic.dev.br](https://docs.fctapp.cacic.dev.br).

O projeto da documentação está disponível na pasta `docs`.

## Aplicativo

O aplicativo é construído com Angular e pode ser acessado em [eventos.cacic.dev.br/app/](https://eventos.cacic.dev.br/app/).


### Desenvolvimento

Antes de começar, instale o [Bun](https://bun.sh/).

Depois, instale as dependências do monorepo:

```bash
bun install
```

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