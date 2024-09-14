---
title: Convenções nos repositórios
---

:::tip
Quando em dúvida, tente lembrar:

Indexar código? Sempre inglês.  
Indexar conteúdo? Português.
:::

:::note

Esta página é um adendo às [convenções do CACiC](https://cacic.dev.br/docs/Projetos/Especifica%C3%A7%C3%B5es%20comuns/Conven%C3%A7%C3%B5es%20gerais/C%C3%B3digos)

:::

## Commits

Os commits do repositório principal devem seguir a [convenção do Angular](https://github.com/angular/angular/blob/main/CONTRIBUTING.md#-commit-message-format).

Os commits no demais repositórios devem seguir apenas as convenções de idioma.

### Convenção

Todo commit consiste em um **header** (cabeçalho), um **body** (corpo) e um **footer** (rodapé). O cabeçalho é obrigatório e o corpo e o rodapé são opcionais.

```
<header>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

O `header` é obrigatório para todo commit.

O `body` é opcional apenas para commits do tipo `docs`. Quando ele está presente, deve ter, no mínimo, 20 caracteres.

O `footer` é opcional.

Textos sempre no tempo verbal presente:  
"fix" ao invés de "fixed" ou "fixes"

#### Header

```
<type>(<scope>): <short summary>
  │       │             │
  │       │             └─⫸ Summary in present tense.
  |       |                  Not capitalized.
  |       |                  No period at the end.
  │       │
  │       └─⫸ Commit Scope: frontend|backend|devops|docs
  │
  └─⫸ Commit Type: build|ci|docs|feat|fix|perf|refactor|test
```

`<type>` e `<short summary>` são obrigatórios. `<scope>` é opcional, mas recomendado.

Limite o header a 72 caracteres.

##### Type

- **build:** Alterações que afetam apenas build ou dependências externas
- **ci:** Alterações nos scripts (workflows) de CI e CD
- **docs:** Alterações na documentação
- **feat:** Um novo recurso
- **fix:** Uma correção de bug
- **perf:** Uma alteração que melhora a performance
- **refactor:** Uma alteração que não corrige um bug, nem adiciona um recurso
- **test:** Adição de testes faltantes ou correção de testes existentes

##### Scopes

- `frontend`
- `backend`
- `devops`
- `docs` - Usado nos casos de alterações no projeto da documentação que não estão relacionadas à documentação do código

#### Body

Esta mensagem de commit deve explicar o porquê de você estar fazendo a mudança.

Você pode incluir uma comparação do comportamento anterior com o novo comportamento para ilustrar o impacto da mudança.

#### Footer

The footer can contain information about breaking changes and deprecations and is also the place to reference GitHub issues, Jira tickets, and other PRs that this commit closes or is related to. For example:

O footer pode conter informações sobre breaking changes e também é o local para referenciar issues do GitHub e PRs que este commit fecha ou está relacionado. Por exemplo:

```
BREAKING CHANGE: <breaking change summary>
<BLANK LINE>
<breaking change description + migration instructions>
<BLANK LINE>
<BLANK LINE>
Fixes #<issue number>
```

<!-- Breaking changes não serão frequentes, mas é necessário especificar, para caso haja alguma -->

A seção de Breaking Change deve começar com a frase "BREAKING CHANGE: ", seguida por um resumo da mudança, uma linha em branco e uma descrição detalhada da mudança, além de incluir instruções de migração.

#### Revert commits

Se o commit reverte um commit anterior, deve começar com `revert: ` seguido do `header` do commit revertido.

O conteúdo do `body` deve conter:

- `This reverts commit <SHA>`, onde `<SHA>` é o hash do commit revertido.
- Uma explicação do motivo da reversão.

### Idioma

🇺🇸

Resumos (título, summary) e descrições dos commits nas branches principais (`main`) sempre em inglês estadunidense.

Dessa forma, é possível encontrar os commits rapidamente e entender o que foi feito.

Caso não se sinta confortável em escrever em inglês, peça ajuda a um colega.  
Não use tradutores automáticos.

### Poupe recursos

Veja a seção de Pushes na página de [sustentabilidade](/Geral/Práticas%20sociais/Sustentabilidade#pushes)


## Branches

Preferencialmente, cada usuário deve trabalhar em forks, não em branches.

### Nome

🇺🇸

Branches sempre em inglês.

Deve seguir o padrão:  
`usuário-do-github/nome-da-funcionalidade`

## Issues

🇧🇷

Títulos e conteúdos de issues sempre em português.

## Pull Requests

🇺🇸 - Títulos  
🇧🇷 - Conteúdo
Livre - Commits

Títulos de PRs devem seguir a formatação de commits.

Conteúdos sempre em português.

Commits em PRs são livres, pois serão mesclados em um único commit durante o _merge_.

### Alterações de Pull Request

Um PR deve conter alterações focadas em um único objetivo ou conter alterações que estejam relacionadas entre si.

São proibidos PRs do tipo "fiz isso, mas aproveitei para fazer isso também".  
Para isso, crie um PR para cada alteração.

## Tags

🇺🇸

Tags sempre em inglês e em minúsculas.

## README

🇧🇷

Sempre em português.  
Só teremos desenvolvedores brasileiros, então não há necessidade de escrever em inglês.

## LICENSE

🇺🇸

Sempre em inglês.

Por utilizarmos dependências feitas por pessoas de outros países, é necessário deixar a licença em inglês para que todos possam entender.
