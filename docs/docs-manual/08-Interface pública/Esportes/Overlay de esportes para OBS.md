---
title: Overlay de esportes para OBS
---

O gerenciamento público da partida tem, no final da página, o acordeão **Overlay para transmissão**.

O overlay é servido pelo backend e acompanha a projeção pública da partida em tempo real. O fundo é transparente e a fonte padrão é a `Inter`; o CSS personalizado da fonte de navegador do OBS pode substituir fonte, cores, tamanhos e posicionamento.


## URL

```text
GET /api/sports/public/matches/{matchId}/overlay
```

O caminho identifica a partida. As opções visuais são query params para que vários layouts da mesma partida possam ser usados em fontes diferentes do OBS.

| Parâmetro | Valores | Padrão | Efeito |
| --- | --- | --- | --- |
| `team` | `both`, `home`, `away` | `both` | Exibe as duas equipes ou apenas uma delas. |
| `teamName` | `0`, `1` | `1` | Exibe o nome das equipes. |
| `teamIcon` | `0`, `1` | `1` | Exibe o logo; sem logo, exibe iniciais. |
| `score` | `0`, `1` | `1` | Exibe o placar. |
| `stopwatch` | `0`, `1` | `1` | Exibe o cronômetro da partida. |
| `period` | `0`, `1` | `1` | Exibe o período/rodada ativo. |
| `state` | `0`, `1` | `1` | Exibe o estado, como `Ao vivo` ou `Pausada`. |
| `periodWord` | `Rodada`, `Tempo`, `Turno`, `Etapa`, `Período`, `Round`, `Set`, `Fase`, `Parcial`, `Mapa` ou `Heat` | `Rodada` | Palavra permitida antes do número do período. Valores desconhecidos voltam para `Rodada`. |

Exemplo de link compacto para mostrar somente o placar das duas equipes:

```text
/api/sports/public/matches/{matchId}/overlay?teamName=0&teamIcon=0&stopwatch=0&period=0&state=0
```

No OBS, ajuste o tamanho da fonte de navegador conforme a resolução da transmissão. Para personalizar a aparência:

```css
.sports-overlay {
  --sports-overlay-text: #ffffff;
  --sports-overlay-muted: #d8dee9;
  --sports-overlay-font-family: "Inter Variable", sans-serif;
}
```
