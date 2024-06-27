# FCT App

[![Documentation](https://img.shields.io/badge/docs-blue)](https://docs.fctapp.cacic.dev.br)
[![Front end build](https://img.shields.io/github/actions/workflow/status/cacic-fct/fct-app/frontend-ci.yml?branch=main&logo=github&label=front%20end%20build)](https://github.com/cacic-fct/fct-app/actions)
[![Back end build](https://img.shields.io/github/actions/workflow/status/cacic-fct/fct-app/backend-ci.yml?branch=main&logo=github&label=back%20end%20build)](https://github.com/cacic-fct/fct-app/actions)
[![Docs build](https://img.shields.io/github/actions/workflow/status/cacic-fct/fct-app/docs.yml?branch=main&logo=github&label=back%20end%20build)](https://github.com/cacic-fct/fct-app/actions)
[![Coverage](https://img.shields.io/codecov/c/github/cacic-fct/fct-app/main?logo=codecov)](https://codecov.io/gh/cacic-fct/fct-app)
[![License](https://img.shields.io/badge/license-AGPL–3.0–only-red)](https://github.com/cacic-fct/fct-app/blob/main/License.txt)

O "FCT App" facilita a vida dos alunos da FCT, com o acesso aos eventos do câmpus. Tem alto potencial de expansão.

> [!WARNING]  
> Leia as discussões sobre migrar do Firebase para uma hospedagem própria ([#182](https://github.com/cacic-fct/fct-app/discussions/182)) antes de desenvolver um recurso novo.

## Contribuindo

Todos podem contribuir para o "FCT App".

Leia o [guia de contribuição do CACiC](https://github.com/cacic-fct/.github/blob/main/Contributing.md).

## Documentação

A documentação do projeto está disponível em [cacic-fct/fct-app-docs](https://github.com/cacic-fct/fct-app-docs).

## Aplicativo

O aplicativo é construído com Angular e pode ser acessado em [fct-pp.web.app](https://fct-pp.web.app).

### Desenvolvimento

Para iniciar o site localmente, primeiro instale o [Ionic CLI](https://ionicframework.com/docs/cli) e o [Bun](https://bun.sh/).

Depois, instale as dependências:

```bash
bun install
```

Em seguida, inicie o servidor de desenvolvimento:

```bash
ionic serve --ssl
```

#### Simulador do Firebase

Instale o [Firebase CLI](https://firebase.google.com/docs/cli) e faça login.

Depois, no diretório do projeto, inicie o emulador com o comando:

```bash
firebase emulators:start --project fct-pp --import=./emulator-data --export-on-exit
```

##### Cloud Functions

Para testar as Cloud Functions, primeiro altere o diretório para `functions`:

```bash
cd functions
```

Depois, instale as dependências:

```bash
bun install
```

Em seguida, compile com:

```bash
bun build
```

Não é necessário reiniciar o simulador após compilar.
