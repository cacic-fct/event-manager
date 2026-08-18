---
title: Overlay de esportes para OBS
---

O overlay transforma o estado público de uma partida em uma fonte para transmissão.

Use o construtor disponível na operação da partida como fonte de verdade. Ele gera o link com as opções visuais suportadas pela versão atual, sem exigir edição manual de parâmetros.

## Antes de gerar o link

A partida precisa estar publicada.

Confirme também que equipes, placar inicial e informações que serão exibidas estão corretos. Despublicar a partida retira a página pública e desativa o overlay.

## Gerar e testar

Na operação pública da partida, abra **Overlay para transmissão**.

Escolha o conteúdo que deve aparecer, copie o link gerado e abra-o em uma nova aba para conferir o resultado.

Para testar o layout sem depender de uma partida real, use:

```text
/api/sports/public/matches/demo/overlay
```

Para maior personalização, você pode criar várias Fontes de navegador (Browser Source), com diferentes parâmetros de estilo e de exibição, em múltiplos links.

## Adicionar no OBS

Crie uma **Fonte de navegador** e informe o link gerado.

Use uma área compatível com a resolução da transmissão e mantenha o fundo transparente. A aparência também pode ser ajustada pelo CSS personalizado da fonte do OBS.

Quando a transmissão usar mais de um layout, gere um link para cada fonte em vez de editar manualmente uma URL existente.

## Durante a partida

O overlay acompanha a projeção pública do placar, cronômetros e períodos.

Mantenha um dispositivo principal para operar a partida. Alterações concorrentes em vários dispositivos podem exigir resolução de conflito antes de chegar ao estado público.

Se as atualizações ao vivo forem interrompidas, a fonte pode continuar mostrando o último estado recebido. Verifique a conexão e atualize a fonte antes de corrigir o placar por outro caminho.

## Quando estiver vazio ou desatualizado

Confira, nesta ordem:

1. A partida está publicada?;
2. O link pertence à partida correta?;
3. A página pública da partida abre e mostra dados?;
4. O dispositivo operador está sincronizado?;
5. A fonte de navegador foi atualizada?

Leia [Operar uma partida](03-Operar%20uma%20partida.md).
