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

#### Autenticação local no GitHub Packages

Algumas dependências do monorepo são pacotes publicados no GitHub Packages. Sem autenticação local, comandos como `bun install` retornam erro `401` ao acessar `https://npm.pkg.github.com`.

[Crie um token do GitHub](https://github.com/settings/tokens) com permissão `read:packages`.

Adicione o token ao arquivo `.env` local:

```bash
NODE_AUTH_TOKEN=ghp_seu_token_aqui
NPM_CONFIG_TOKEN=${NODE_AUTH_TOKEN}
```

O arquivo `.env` é ignorado pelo Git.  
`NODE_AUTH_TOKEN`e `NPM_CONFIG_TOKEN` são variáveis de ambiente usadas para autenticação com o GitHub Packages. A variável `NPM_CONFIG_TOKEN` é a que o Bun usa para resolver o token referenciado no `.npmrc`:

```ini
//npm.pkg.github.com/:_authToken=${NPM_CONFIG_TOKEN}
```



#### Iniciando o desenvolvimento

Instale as dependências do monorepo:

```bash
bun install
```

Se o comando ainda retornar `401`, verifique se o token tem `read:packages` e se sua conta tem acesso ao pacote no GitHub Packages.

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
