---
title: Firewall
---

## Portas abertas

A abertura de portas é feita pela Diretoria Técnica de Informática (DTI) e deve ser solicitada por meio de um professor ou por meio de um funcionário do departamento.

- 80 (HTTP) - TCP e UDP
- 443 (HTTPS) - TCP e UDP
- 22 (SSH) - TCP - Responde apenas a IPs da Unesp

A máquina não deve expor mais nenhuma porta para a internet.

## Tabela de regras

```
Chain INPUT (policy DROP)
target     prot opt source               destination
ACCEPT     all  --  anywhere             anywhere
ACCEPT     tcp  --  200.145.0.0/16       anywhere             tcp dpt:ssh
ACCEPT     tcp  --  186.217.0.0/16       anywhere             tcp dpt:ssh
ACCEPT     tcp  --  anywhere             anywhere             tcp dpt:http
ACCEPT     udp  --  anywhere             anywhere             udp dpt:80
ACCEPT     tcp  --  anywhere             anywhere             tcp dpt:https
ACCEPT     udp  --  anywhere             anywhere             udp dpt:https
ACCEPT     all  --  anywhere             anywhere             state RELATED,ESTABLISHED
ACCEPT     icmp --  200.145.0.0/16       anywhere             icmp echo-request
ACCEPT     icmp --  186.217.0.0/16       anywhere             icmp echo-request
```

Note que o servidor apenas responde a requisições ICMP (ping) de dentro da Unesp.