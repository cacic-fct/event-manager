# FCT App - Front end

## Desenvolvimento

Para iniciar o site localmente, primeiro instale o [Ionic CLI](https://ionicframework.com/docs/cli):

```bash
bun install -g @ionic/cli
```

Depois, instale as dependências:

```bash
bun install
```

Em seguida, inicie o servidor de desenvolvimento:

```bash
ionic serve --ssl
```

### Simulador do Firebase

Instale o [Firebase CLI](https://firebase.google.com/docs/cli) e faça login.

Depois, no diretório do projeto, inicie o emulador com o comando:

```bash
firebase emulators:start --project fct-pp --import=./emulator-data --export-on-exit
```

### Cloud Functions

Para testar as Cloud Functions, siga o [README do back end](https://github.com/cacic-fct/fct-app/blob/main/backend/README.md).