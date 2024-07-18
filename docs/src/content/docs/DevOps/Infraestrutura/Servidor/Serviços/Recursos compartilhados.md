---
title: Recursos compartilhados
---

O servidor do FCT App também hospeda outros serviços utilizados pelo CACiC.

## Authentik (autenticação)

Utilizado para autenticação comum entre os serviços do CACiC.

Deve-se fazer login com a conta Google.

Disponível em [auth.cacic.dev.br](https://auth.cacic.dev.br).

## Highlight (monitoramento)

Platforma de monitoramento do CACiC.

Disponível em [highlight.cacic.dev.br](https://highlight.cacic.dev.br).

## Immich (fotos)

Serviço de armazenamento de fotos do CACiC, utilizado para divulgação de álbuns de eventos acadêmicos.

Disponível em [fotos.cacic.dev.br](https://fotos.cacic.dev.br).

## Infisical (segredos)

Serviço de armazenamento de segredos do CACiC.

Disponível em [secrets.cacic.dev.br](https://secrets.cacic.dev.br).

## Mailcatcher ("fake" SMTP)

Serviço de SMTP utilizado para testes de envio de e-mails.

Servidor disponível em `mailcatcher:1025` na rede Docker `smtp` e `traefik`.  
Caixa de entrada disponível em [smtp.cacic.dev.br](https://smtp.cacic.dev.br).

## Plausible (analytics)

Serviço de análise do CACiC.

Substitui o Google Analytics.

Disponível em [plausible.cacic.dev.br](https://plausible.cacic.dev.br).

## Traefik (proxy/roteamento)

Serviço de proxy reverso utilizado para roteamento de tráfego e gestão de certificados SSL.

O dashboard pode ser acessado em [traefik.cacic.dev.br/dashboard/](https://traefik.cacic.dev.br/dashboard/).

## Typesense (busca)

Serviço de busca de projetos do CACiC, como a [base de conhecimento do CACiC](https://cacic-fct.github.io/kb) e o [manual do calouro](https://cacic-fct.github.io/manual-do-calouro).

API disponível em [typesense.cacic.dev.br](https://typesense.cacic.dev.br).

## Uptime kuma (status page)

Página de estado dos serviços do CACiC.

Disponível em [status.cacic.dev.br](https://status.cacic.dev.br).

## Vaultwarden (senhas)

Gerenciador de senhas do CACiC.

Disponível em [senhas.cacic.dev.br](https://senhas.cacic.dev.br).

:::danger

Todos que possuem acesso ao servidor também possuem acesso às senhas armazenadas no Vaultwarden.

:::
