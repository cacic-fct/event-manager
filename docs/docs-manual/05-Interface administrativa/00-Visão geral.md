---
title: Visão geral
---

O painel de administração é a área de trabalho dos organizadores. Ele deve ser usado para cadastro, conferência, correção e auditoria dos dados do sistema.

Para operações em campo, principalmente coleta de presença durante o evento, prefira a interface pública. O painel administrativo carrega mais dados, depende de permissões mais amplas e é menos adequado para uso em celular ou em conexão limitada.

## Como usar esta seção

Cada página desta seção descreve uma parte específica do painel. Use a página correspondente ao botão de ajuda da tela em que você está.

Quando a dúvida for sobre a modelagem do evento em si, consulte antes:

- [Entenda a estruturação](../02-Gerenciar%20Eventos/00-Entenda%20a%20estruturação.md);
- [Criar um evento](../02-Gerenciar%20Eventos/02-Criar%20um%20evento.md);
- [Criar um grupo de eventos](../02-Gerenciar%20Eventos/03-Criar%20um%20grupo%20de%20eventos.md);
- [Criar um grande evento](../02-Gerenciar%20Eventos/04-Criar%20um%20grande%20evento.md).

## Padrão das telas

A maior parte das telas administrativas possui uma área de busca ou lista e uma área de edição ou detalhe.

Selecionar um item carrega seus dados. Em telas com busca, a lista pode começar vazia até que os filtros sejam aplicados.

O botão **Novo** inicia um cadastro vazio.  
O botão **Limpar** remove a seleção atual do formulário, mas não exclui o registro salvo.  
O botão **Atualizar** recarrega os dados já carregados na tela.

Exportações em CSV dependem dos registros carregados naquela tela. Antes de exportar, confira se o filtro, o evento ou o grande evento correto está selecionado.

## Testes

Não crie eventos, inscrições, pessoas ou certificados de teste no ambiente de produção.

O sistema usa soft delete em diversas operações. Mesmo quando um item parece ter sido excluído, ele pode continuar existindo no banco de dados para fins de auditoria e manutenção.

Execute o projeto localmente para validar fluxos experimentais.
