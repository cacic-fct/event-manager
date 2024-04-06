# FCT App

O "FCT App" facilita a vida dos alunos da FCT, com o acesso aos eventos do câmpus. Tem alto potencial de expansão. 

## Contribuindo

Todos podem contribuir para o "FCT App".

Leia o [guia de contribuição do CACiC](https://github.com/cacic-fct/.github/blob/main/Contributing.md).

## Site

O aplicativo é construído com Angular e pode ser acessado em [fct-pp.web.app](https://fct-pp.web.app).

### Desenvolvimento

Para iniciar o site localmente, primeiro instale as dependências:

```bash
yarn
```

Depois, inicie o servidor de desenvolvimento:

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
yarn # --ignore-engines caso não funcione
```

Em seguida, compile com:
```bash
yarn build
```

Não é necessário reiniciar o simulador após compilar.
