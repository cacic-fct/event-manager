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

Quando um story depender de backend, prefira MSW e fixtures realistas.

Para fixtures, use os arquivos compartilhados no repositório, para evitar código duplicado.

## Workbox

Após mudanças no service worker público ou nas regras de cache, rode:

```bash
bunx nx run public:test-workbox
```

Também confira o build de produção do `public`, porque o Workbox entra no alvo de build final.

## Acessibilidade

Os testes com Axe identificam problemas automáticos; um resultado sem violações não comprova conformidade completa com WCAG. Combine-os com testes de teclado e uma avaliação manual com tecnologia assistiva.

Para os registros de contexto, confira no Storybook e na aplicação:

- O leitor de tela anuncia um nome curto para a ação e os metadados como descrição, sem repeti-los no nome.
- Tab e Shift+Tab percorrem a ação principal e as ações secundárias com foco visível. Enter ativa links e botões; Espaço ativa botões.
- Clicar nos metadados aciona o registro correto, sem interferir nas ações secundárias. Registros desabilitados não respondem.
- A navegação sem edições dispensa confirmação. Com edições, cancelar mantém os valores e devolve o foco; confirmar permite sair.
- Zoom de 200%, tela estreita e temas claro/escuro preservam leitura, foco e acesso às ações.

Registre o leitor de tela, navegador, sistema e resultados usados na avaliação. Não marque a avaliação manual como concluída apenas porque os testes automáticos passaram. Asserções do nome e da descrição calculados verificam a semântica exposta pelo navegador, mas não substituem ouvir a experiência em um leitor de tela.
