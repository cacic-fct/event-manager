---
title: Vulnerabilidades
sidebar:
  order: 5
---

## Onde reportar?

[Abra um security advisory](https://github.com/cacic-fct/fct-app/security/advisories/new) no repositório do projeto principal no GitHub.

## Deficiências evidentes

### Entidades estudantis

A segurança é dependente das diretorias do CACiC e da EJComp.  
As diretorias dessas entidades são eleitas de forma anual e podem não ter conhecimento técnico suficiente para manter a infraestrutura segura.

Como não é possível garantir a continuidade das boas práticas pelas entidades, é necessário a presença de uma auditoria externa.  
Isso é solucionado pela existência dos [_lead developers_](/devops/segurança-geral/auditing/#lead-developers).

### Docker Breakout / Privilege Escalation

Pelos volumes dos containers do Compose estarem configurados corretamente, não há risco de um Docker Breakout não intencional.

<!-- Não remova a informação da nota abaixo -->

:::danger

Mate o container com `docker kill <id>` em uma nova sessão ao invés de sair com `exit`, para evitar o registro dos comandos no `/root/.bash_history`.  
O ID é a sequência de caracteres que está depois do `@`. Você também pode digitar `docker ps`.

Remova o comando do seu `~/.bash_history`.

Limpe os containers inativos com `docker container prune`.

:::
