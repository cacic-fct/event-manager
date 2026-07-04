# Desenvolvimento local e validação

Use Bun para instalar dependências e executar comandos do monorepo.  
Não use `npm`, `npx`, `yarn`, `pnpm`, etc..

## Preparação inicial

1. Instale as dependências na raiz do repositório:

   ```bash
   bun install
   ```

2. Copie `apps/backend/.env.example` para o arquivo de ambiente usado no desenvolvimento local e ajuste apenas o que for necessário para a sua máquina.

3. Suba os serviços locais quando o backend precisar de banco, Redis, busca, etc.:

   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d
   ```

4. Gere o cliente Prisma depois de instalar dependências ou alterar arquivos de schema:

   ```bash
   bunx prisma generate --schema apps/backend/prisma/schema
   ```

## Variáveis de ambiente

Não copie segredos de produção para ambientes locais.  
Quando uma variável tiver valor seguro de desenvolvimento no exemplo, prefira esse valor.

## Prisma

O schema do banco fica em `apps/backend/prisma/schema`.

Depois de editar o schema, gere o cliente antes de rodar lint, testes ou build:

```bash
bunx prisma generate --schema apps/backend/prisma/schema
```

## Antes de abrir PR

Confira:

- `git status --short`, para revisar o escopo real da alteração. PRs com muitas alterações não relacionadas podem ser negados;
- Se o cliente Prisma foi gerado quando o schema mudou;
- Se os testes cobrem o comportamento alterado;
- Se Storybook foi criado ou atualizado quando uma UI ganhou estados relevantes;
- Se a documentação foi atualizada quando a regra operacional mudou.

Mudanças em autorização, privacidade, presença, certificados, pagamentos, publicação e auditoria devem ser validadas no backend, mesmo que a interface também esconda a ação.
