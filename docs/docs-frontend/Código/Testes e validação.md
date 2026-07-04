# Testes e validação

## Comandos comuns

```bash
bunx nx lint admin
bunx nx test admin
bunx nx build admin
```

```bash
bunx nx lint public
bunx nx test public
bunx nx build public
```

```bash
bunx nx test backend
bunx nx build backend
```

Após alterações no Prisma, não deixe de rodar:

```bash
bunx prisma generate --schema apps/backend/prisma/schema
```

## E2E

E2E de frontend pode iniciar os servidores necessários quando `E2E_START_SERVER=true`.

```bash
E2E_START_SERVER=true bunx nx e2e admin-e2e -- --project=chromium
E2E_START_SERVER=true bunx nx e2e public-e2e -- --project=chromium
```

E2E de backend com Keycloak usa o script do pacote:

```bash
bun run e2e:backend:keycloak -- --coverage
```

## Storybook

Use Storybook para estados visuais, loading, erro, vazio, permissão ausente, rede off-line, etc.

```bash
bunx nx build-storybook admin --configuration=ci
bunx nx build-storybook public --configuration=ci
```

Quando uma story depender de backend, prefira MSW e fixtures realistas.

Para fixtures, use os arquivos compartilhados no repositório, para evitar código duplicado.

## Workbox

Mudanças no service worker público ou nas regras de cache devem rodar:

```bash
bunx nx run public:test-workbox
```

Também confira o build de produção do `public`, porque o Workbox entra no alvo de build final.