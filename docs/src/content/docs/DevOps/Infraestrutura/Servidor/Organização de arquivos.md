---
title: Organização de arquivos
---

## Estrutura de pastas

A estrutura de pastas do servidor do FCT App é organizada da seguinte forma:

```plaintext
/
├── /home
│   ├── /shared
│   │   ├── /docker-compose
│   │   │   ├── /{serviço}
|   |   |   |   ├── docker-compose.yml
|   |   |   |   ├── .env
│   │   ├── /docker-data
│   │   │   ├── /{serviço}
│   ├── /{usuário}
```

## Datas

Quaisquer datas devem ser escritas no formato `YYYY-MM-DD`, para facilitar a ordenação. Para incluir a hora, utilize o formato ISO 8601 em UTC: `YYYY-MM-DDTHH:MM:SSZ`.