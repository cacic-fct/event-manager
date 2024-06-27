---
title: Especificações
---

## Encoding da identificação do certificado

Para reduzir o consumo de espaço no BD, preferiu-se realizar o _encoding_ dos dados em `BASE64` à armazenar _hashes_ ou _uuids_ genéricas.  
Prefere-se `BASE64` à `BASE32` por conta do tamanho da string. Como há o QR Code para a verificação, não há a preocupação em digitar o código manualmente.

## QR Code

Não usar Aztec Code, pois esse código precisa ser lido por qualquer leitor fora do FCT App.

O QR Code deve apontar diretamente para a página de validação do certificado, que deve ser acessível publicamente.

## Frente

A frente existe apenas para fins estéticos. Todas as informações essenciais estão no verso.

## Verso

O verso contém todas as informações essenciais do certificado, como:

- Nome completo
- Documento
- Data
- Descrição
- QR Code para validação

Com a necessidade imposta pela coordenação do curso de imprimir todos os certificados para a validação de ACCs, o layout do verso foi pensado para ser impresso em papel A4.

Dessa forma, torna-se dispensável a impressão da frente.  
O verso pode ser impresso em preto e branco e não contém grandes imagens ou detalhes para poupar tinta.
