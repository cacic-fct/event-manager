# Storybook

O Storybook é uma ferramenta de desenvolvimento que permite criar, testar e documentar componentes de UI em um ambiente separado da aplicação principal. Ele facilita a visualização e o teste de componentes em diferentes estados e variações, promovendo a reutilização e a consistência do design.

O CACiC Event Manager usa o Storybook para desenvolver e documentar os componentes da interface do usuário.

Uma cópia do Storybook do projeto está disponível em [storybook.eventos.cacic.com.br](https://storybook.eventos.cacic.com.br/).

## Projetos

O monorepo possui Storybook para os frontends:

```bash
bunx nx storybook admin
bunx nx storybook public
```

## Quando criar um story

Crie ou atualize stories quando o componente tiver:

- Estados de carregamento, vazio, erro ou permissão ausente;
- Comportamento off-line;
- Variações de tema claro e escuro;
- Fluxos de confirmação;
- Dados sensíveis que precisam de rótulos e estados claros;
- Interação reutilizada em mais de uma tela;
- Componentes com estados difíceis de reproduzir no app completo.

Não use o Storybook para substituir testes de regras de negócio do backend.

## Mocks

Prefira MSW para simular GraphQL, REST e erros de rede. Use as fixtures realistas compartilhadas e `fakerPT_BR` quando dados pessoais fictícios, para que o story fique mais parecido com a operação real.

Evite stubs locais que pulam a camada de API quando o story precisa demonstrar estados de requisição.

## Assets

Componentes usados no app e no Storybook precisam resolver assets de forma compatível com base paths diferentes.

Quando um componente precisar montar URL de asset, prefira resolver a partir de `DOCUMENT.baseURI`. Não use caminho absoluto fixo que só funcione em `/app/` ou `/admin/`.

## Publicação

O workflow de Storybook publica `admin` e `public` em subpastas separadas no GitHub Pages.

Mudanças em configuração de Storybook devem preservar:

- Desenvolvimento local;
- Build estático;
- Deploy em subpasta;
- Carregamento do MSW;
- Assets em `apps/<app>/public`.
