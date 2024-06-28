---
title: Divisão do projeto
sidebar:
  order: 0
---

## Os repositórios

O FCT App é um projeto único, mas está dividido em 3 repositórios:

- [FCT App](https://github.com/cacic-fct/fct-app) - Frontend, backend e documentação;
- [FCT App Assets](https://github.com/cacic-fct/fct-app-assets) - Composição de imagens, sons e outros recursos com armazenamento em arquivos binários.
- [FCT App Credentials](https://github.com/cacic-fct/fct-app-credentials) - Credenciais e configurações sensíveis.

O FCT App também pode fazer uso de outros projetos ou repositórios da organização do CACiC, mas estes não estarão listados aqui se não forem parte do projeto do FCT App.

## O que não é admitido

### Divisão desnecessária de projetos

O FCT App é um aplicativo único e deve ser tratado como tal.  
Não admite-se a modularização das funcionalidades do projeto em repositórios diferentes.

Admite-se a separação de pacotes que possam ser reaproveitados em outros projetos.

#### Exemplo positivo

O pacote [@cacic-fct/starlight-typesense-docsearch](https://github.com/cacic-fct/starlight-typesense-docsearch) tem a funcionalidade genérica de pesquisa, logo, pode ser usado no FCT App Docs e em outros projetos.

#### Exemplo negativo

O painel de administração do FCT App não deve ser separado da parte de usuários do FCT App.  
O administrador também é aluno e, consequentemente, usuário do FCT App.

Separar a área de administração por motivos de segurança é uma prática desnecessária.  
O principal responsável pela segurança é o backend, não o frontend.

## Perguntas

### O que não faz parte do projeto do FCT App?

Projetos que não tenham relação direta com o FCT App não devem ser incluídos no projeto.

Por exemplo, mesmo que a SECOMPP faça uso do FCT App e de suas APIs, o site da SECOMPP não faz parte do projeto do FCT App.
