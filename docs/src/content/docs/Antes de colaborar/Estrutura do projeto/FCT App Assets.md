---
title: FCT App Assets
---

O Git não é uma plataforma de versionamento de arquivos binários, da mesma forma que o Github não é uma plataforma de distribuição para estes arquivos.

Dessa forma, é necessário um repositório separado para que o histórico de commits não fique poluído com alterações ilegíveis realizadas em arquivos binários.

## O que faz parte desse repositório

Arquivos binários que não são e não serão utilizados de forma _direta_ em qualquer outro repositório.  
Exemplo: Arquivos de composição de image (Adobe Photoshop, Adobe Illustrator), composição de áudios (GarageBand, Ableton), vídeos (Adobe Premiere), etc.

## O que não faz parte desse repositório

Arquivos binários que sejam diretamente utilizados em qualquer outro repositório.  
Exemplo: Imagens (.png, .jpg), sons (.mp3, .wav), vídeos (.mp4, .mov), animações, etc.

Caso haja algum arquivo binário que seja utilizado em outro repositório, ele deve ser adicionado ao repositório correspondente.
