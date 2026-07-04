---
title: Auditoria
---

A tela de auditoria permite consultar alterações registradas no sistema. Ela é restrita a super administradores (`super-admin`).

## Quando usar

Use a auditoria para:

- Descobrir quem alterou um registro;
- Conferir quando uma publicação mudou;
- Investigar permissões usadas em uma ação;
- Entender por que uma correção antiga existe;
- Apoiar análise de incidentes.

Não use a auditoria para:

- Listar participantes;
- Exportar dados pessoais;
- Comprovar presença;
- Validar certificado;
- Substituir relatórios de inscrição ou pagamento.

## Busca

Se o Typesense estiver indisponível, a busca é realizada diretamente pelo banco de dados e mostra o estado dele.

## Resultado

Cada entrada pode mostrar:

- Operação realizada;
- Entidade alterada;
- Autor;
- Permissão usada;
- Evento, grupo ou grande evento relacionado;
- Primeiro e último registro agrupado;
- Campos alterados;
- Snapshots brutos antes e depois;
- Metadados.

Snapshots e metadados podem conter dados pessoais ou operacionais sensíveis. Não copie essas informações para canais públicos.

## Entradas agrupadas

Alterações rápidas no mesmo item podem aparecer agrupadas. O agrupamento reduz ruído, mas não deve ser interpretado como uma única ação humana quando houver múltiplas mudanças em sequência.

## Reversões

Alguns tipos de alteração podem ser revertidos automaticamente por fluxos internos do sistema.

**Nem toda operação é reversível.**

Antes de reverter qualquer alteração:

- Confira se o item ainda existe;
- Confira se campos posteriores não mudaram a mesma informação;
- Confira se o recurso está congelado;
- Confira se certificados, presenças, inscrições ou comprovantes podem ser afetados;
- Registre o motivo operacional fora da ferramenta quando a decisão envolver pessoas.

## Privacidade

Logs de auditoria podem conter nome, e-mail, documento, identificadores e valores antigos.

Quando uma solicitação LGPD exigir anonimização, o backend deve preservar a rastreabilidade da operação e remover identificadores diretos do titular sempre que aplicável.
