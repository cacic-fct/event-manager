---
title: Traefik
---

## Comandos padrão

O comando `- "--api.insecure"` deve ser definido para `false`, para evitar que a API do Traefik seja acessível sem autenticação.

`- "--providers.file.directory=/providers"` define o diretório onde os arquivos de configuração do Traefik estão localizados.

### Entrypoints

- web - HTTP (80)
- websecure - HTTPS (443)

#### Redirecionamento para HTTPS

Todo o tráfego HTTP é redirecionado para HTTPS. Isso é feito através dos comando abaixo:

```yaml
- "--entrypoints.web.http.redirections.entryPoint.to=websecure"
```

#### _Responding timeouts_

https://github.com/traefik/traefik/wiki/respondingTimeouts-for-applications

```yaml
- "--entrypoints.websecure.transport.respondingTimeouts.readTimeout=0s"
```

### Certificados SSL

É necessário utilizar o HTTP Challenge, pois é emitido um certificado para o redirect do `38a.fct.unesp.br`, que não possuímos acesso.

## Acesso direto

### 38a.fct.unesp.br e FCTDTIWEBXP01.cacic.dev.br

Redirecionar para esta documentação.

Por excesso de cautela, foi adicionado um _rate limit_.

### IP do servidor

Nega-se acesso direto ao IP do servidor.

Para isso, é necessário configurar o Traefik para recusar requisições que não possuam uma extensão `server_name` válida.

No momento (julho de 2024), só é possível definir isto na configuração estática.

```yaml
# https://github.com/traefik/traefik/issues/5507
tls:
  options:
    directIp:
      sniStrict: true
```
