---
title: Organização das pastas
sidebar:
  order: 1
---

## Diretórios específicos

### /

- Dockerfile

### /functions/

Contém as funções do Firebase.

### /docker/

Contém os arquivos das configurações do Docker e das configurações dos serviços executados no Docker.

### /src/app/shared

Qualquer coisa que seja compartilhada entre componentes, incluindo outros componentes que não tenham roteamento (páginas).

- Components
- Directives
- Modals - Componentes que são exibidos como modais
- Pipes
- Services
- Etc.

Se um componente só é compartilhado entre outros componentes de um mesmo grupo, ele deve ficar dentro da pasta `shared` do grupo.

### /src/app/unused

Contém componentes que não estão sendo utilizados no momento, mas que podem ser úteis no futuro.

## Grupos do /src/app

Grupos são pastas que contêm componentes que compartilham um mesmo contexto.

### about

Páginas que contam com informações sobre o projeto, incluindo:

- Licenças
- Política de privacidade
- Suporte

### auth

Página do login apenas.

### development-tools

Páginas usadas apenas no ambiente de desenvolvimento, estando excluídas do ambiente de produção.

### landing

Página inicial do aplicativo (index).

### modals

Modals globais que interrompem a navegação do usuário.  
Modals não-intrusivos devem ser armazenados na pasta `shared/modals`.

### profile

Páginas relacionadas ao perfil do usuário.

### restricted-area

Páginas que contam com a exibição de conteúdo protegido por claims de administração.

### tabs

Páginas que contam com a exibição das abas.

### validate-certificate

Página da validação de certificados apenas.  
Deve ser renomeada quando outras funcionalidades forem implementadas.
