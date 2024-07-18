---
title: Especificações de serviços
---

## Proxy

O proxy principal do servidor é o Traefik.

Nenhum outro serviço deve ser exposto diretamente na internet.

Nenhum outro proxy deve ser utilizado antes do Traefik.

## Proibições

### Serviços

#### Instalação

É proibida a instalação de serviços diretamente no servidor. Todos os serviços devem ser instalados em containers Docker.  

Isso facilita na manutenção e na escalabilidade do servidor, além de ser mais fácil de recuperar em caso de falhas.

#### Tipos 

Por conta da limitação de recursos do servidor e para garantir a estabilidade dos serviços indispensáveis:

- É proibida a instalação de serviços que não sirvam ao CACiC no servidor do FCT App.
- É proibida a instalação de serviços de interface gráfica para softwares CLI, como o Portainer.

É proibida a instalação de serviços que armazenem dados essenciais, que não possam ser perdidos.  
Por exemplo, não deve-se hospedar repositorios de código (GitLab, Gitea, etc), pois os códigos podem ser perdidos permanentemente.  
Senhas e autenticação de 2 fatores são recuperáveis, então é possível hospedar o Vaultwarden.  
Fotos não são essenciais, então é possível hospedar o Immich.


### Exposição de portas

É proibida a exposição de portas diretamente no servidor.

Use o proxy e o domínio `*.cacic.dev.br` para redirecionar para o serviço.