---
title: Fontes e ícones
---

É proibido vincular fontes e ícones por meio de links externos, pelas tags `<script>`, `<link>`, `<img>`, etc.

Todos os arquivos de fontes e ícones devem ser distribuídos ou por pacotes, ou por arquivos locais ou por meio de um repositório na organização do CACiC, com distribuição via CDN.

A única exceção é para emojis.

## Fontes

As fontes devem ser distribuídas somente por meio de arquivos `.woff2` ou com formato mais eficiente.

Distribuir apenas os estilos e os pesos de fontes necessários para o projeto.

## Ícones

O pacote de ícones do projeto é o [Ionicons](https://ionic.io/ionicons).

Caso um ícone não esteja disponível, considere encontrar um ícone alternativo no próprio Ionicons.

Em último caso, inclua o ícone no projeto por meio da pasta `assets`, mas não se esqueça de otimizá-lo e de creditar o autor na página de licenças.  
Confira a licença do ícone antes de utilizá-lo!

### Fontes de ícones

É proibido usar fontes de ícones.

Os ícones ficam embaçados por conta da aplicação de anti-aliasing em fontes.  
A fonte ocupa um espaço significativamente maior do que arquivos SVG.

Exemplo:

```html
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
```

Por necessitar da fonte com todos os ícones, um único ícone Material Symbols Outlined gerará um impacto de `3 MB`, enquanto o mesmo ícone avulso em SVG possui `193 bytes` de tamanho.

## Emoji

Twemoji distribuído pelo jsDelivr.
