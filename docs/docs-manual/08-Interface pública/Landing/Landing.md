---
title: Landing (index)
---

A página de _landing_ é necessária para receber aval do Google Cloud para utilização do oAuth.

Ela deve conter informações sobre o projeto.

Deve-se redirecionar automaticamente os usuários logados para a página do calendário.

## Quirk

Para que as abas continuem na raiz do caminho (`/calendario`), a página de _landing_ está na rota das abas.  
O componente tab-bar contém um CSS que esconde os elementos com base na rota atual.
