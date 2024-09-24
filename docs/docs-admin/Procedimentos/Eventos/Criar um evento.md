---
title: Criar um evento
---

## Gerenciar

### Editar evento

Não é possível editar um evento diretamente pelo FCT App.

Acesse o [Console do Firebase](https://console.firebase.google.com/) e edite o evento diretamente no Firestore.


### Grupo de eventos

Se um evento está dividido em várias partes, crie um novo evento para cada uma delas.

Depois, na página de gerenciar eventos, agrupe-as com a ferramenta de grupos (ícone da pasta).

### Evento faz parte de um grande evento

Se o evento faz parte de um grande evento, crie o grande evento _antes_ de criar os eventos que o compõem.

Lembre-se de indicar o grande evento na página de criação do evento.

#### Evento é obrigatório 

A lista de eventos obrigatórios é hardcoded. 
Inclua os IDs no array `mandatoryEvents` do arquivo [`frontend/src/app/tabs/major-events-display/subscribe/subscribe.page.ts`](https://github.com/cacic-fct/fct-app/blob/main/frontend/src/app/tabs/major-events-display/subscribe/subscribe.page.ts)

## Campos do formulário

### Descrição curta

A descrição curta é exibida embaixo do nome do evento na lista de eventos do calendário.

O campos pode ser usado para o subtítulo do evento ou para indicar o local, público-alvo, palestrante ou ministrante.