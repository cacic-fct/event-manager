---
title: DNS
---

O DNS é gerenciado pelo CACiC.

A entidade deve adotar práticas de segurança para proteger o acesso às configurações do DNS, de modo a evitar ataques de sequestro ou _spoofing_. Além disso, deve facilitar o debugging.  
Dessa forma:

- O DNSSEC deve ser habilitado;
- Não deve-se utilizar registros com _wildcards_;

## Tabela de registros

Essa tabela é um adendo à [tabela de registros do CACiC](https://cacic.dev.br/docs/Dom%C3%ADnio/DNS/Registros%20DNS).

| Tipo    | Nome                                   | Destino             | Proxy |
| ------- | -------------------------------------- | ------------------- | ----- |
| `CNAME` | fctapp.cacic.dev.br                    | fct.cacic.dev.br    | Sim   |
| `CNAME` | docs.fctapp.cacic.dev.br               | cacic-fct.github.io | Não   |
| `CNAME` | supabase-fctapp.cacic.dev.br           | fct.cacic.dev.br    | Sim   |
| `CNAME` | analytics-supabase-fctapp.cacic.dev.br | fct.cacic.dev.br    | Sim   |
| `CAA`   | letsencrypt.org                        |                     | -     |

É indispensável a inclusão do registro `CAA` para cada um dos domínios, a fim de garantir a segurança dos certificados SSL.

## Configurações do CloudFlare

O CloudFlare não pode injetar conteúdo no HTML da página. Uma regra específica deve ser feita para impedir isso:

```
(http.host eq "fctapp.cacic.dev.br")
```

- Auto Minify - Off
- Browser Integrity Check - On
- Disable Apps
- Disable Zaraz
- Email Obfuscation - Off
- Opportunist Encryption - On
- Rocket Loader - Off
