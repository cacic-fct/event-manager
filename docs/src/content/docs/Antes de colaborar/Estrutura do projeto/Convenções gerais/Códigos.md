---
title: Nos códigos
---

:::tip
Quando em dúvida, tente lembrar:

Programação sempre inglês.
:::

## Nomenclatura

🇺🇸

Nomes sempre em inglês estadunidense.  
Sejam nomes de variáveis, funções, classes, arquivos, pastas, etc.

Exemplo:  
Ao invés de `colour` use `color`.

Exceção: Rotas baseadas em nomes de arquivos.

## Comentários

🇺🇸 - Preferencial  
🇧🇷

Dar preferência para comentários em inglês.  
Caso você não se sinta confortável em escrever em inglês, comente em português e coloque os elementos de inglês obrigatório entre parênteses.

Não usar tradutores automáticos.

Não misturar idiomas em um mesmo comentário.

```typescript del={2} ins={5, 7}
// Não faça isso:
// This should be used with minicursos

// Faça:
// This should be used with short courses
// ou
// Isso deve ser usado com minicursos (shortCourses)

doSomething(shortCourses: string[]) {
…

```
