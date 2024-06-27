---
title: Nos repositórios
---

:::tip
Quando em dúvida, tente lembrar:

Indexar código? Sempre inglês.  
Indexar conteúdo? Português.
:::

## Commits

:::caution
O repositório principal do FCT App possui convenções adicionais sobre a formatação dos commits.
:::

### Idioma

🇺🇸

Resumos (título, summary) e descrições dos commits nas branches principais (`main`) sempre em inglês estadunidense.

Dessa forma, é possível encontrar os commits rapidamente e entender o que foi feito.

Caso não se sinta confortável em escrever em inglês, peça ajuda a um colega.  
Não use tradutores automáticos.

### Formatação

Tente limitar os commits a 50 caracteres.  
Não há problema em ultrapassar, mas tente ao máximo incluir um resumo sucinto e o excedente na descrição.

Mensagens sempre no tempo verbal presente.

**Exemplos corretos:**

- "Add button to landing page"
- "Fix login loop bug in auth service"
- "Fix typo in subscriptions page"
- "Add button to landing page, replace placeholders"
- "Change 'inscrição' text to 'participação' in subscriptions page"

**Exemplos incorretos:**

- "Added button to landing page"
- "Fix bug"
- "Fix the bug in the login loop in the auth service"
- "Typo"
- "Small changes"
- "Add button to landing page, replace placeholders, fix typos, add comments"
  - Muito longo, tente dividir em commits menores

### Poupe recursos

Veja a seção de Pushes na página de [responsabilidade ambiental](/práticas-sociais/sustentabilidade#pushes)

## Branches

Preferencialmente, cada usuário deve trabalhar em forks, não em branches.

### Nome

🇺🇸

Branches sempre em inglês.

Deve seguir o padrão:  
`usuário-do-github/nome-da-funcionalidade`

Exemplo:  
`yudi/fix-subscriptions-page`

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
