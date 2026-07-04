# Formulários de eventos

Formulários de eventos permitem coletar respostas ligadas a eventos e grandes eventos sem criar fluxos separados para cada caso.

## Modelo de domínio

Um formulário possui:

- Um dono administrativo, que pode ser evento ou grande evento;
- Vínculos com eventos ou grandes eventos onde ele aparece;
- Um conjunto de campos do formulário;
- Estado de publicação;
- Regra de sigilo;
- Modo de contagem de respostas.

O dono ajuda a organizar o formulário no painel. Os vínculos decidem onde o público pode responder.

## Vínculos

Cada vínculo aponta para um evento ou grande evento e define:

- Público autorizado: inscritos, participantes com presença ou ambos;
- Janela de disponibilidade;
- Ordem de exibição;
- Se o formulário entra no fluxo de inscrição;
- Se ele é obrigatório para concluir a inscrição;
- Se perguntas obrigatórias devem ser validadas;
- Se pessoas elegíveis devem ser notificadas quando o formulário ficar disponível;
- Se ministrantes podem publicar manualmente, quando o vínculo é de evento.

Formulários inseridos no fluxo de inscrição não devem disparar notificação de disponibilidade, porque a pessoa vê o formulário enquanto se inscreve.

## Publicação

Formulários podem ficar em rascunho, publicados ou agendados.

O scheduler de formulários verifica publicações vencidas periodicamente e também processa notificações de vínculos que ficaram disponíveis. O scheduler não substitui validações de leitura: as consultas públicas continuam verificando publicação, vínculo, alvo, audiência e janela de disponibilidade.

## Sigilo

O sigilo afeta identidade, respostas individuais e resultados:

| Sigilo | Efeito |
| --- | --- |
| `PUBLIC` | Administradores, ministrantes autorizados e pessoas elegíveis podem ver identidade e respostas conforme o contexto. |
| `PARTIALLY_SECRET` | Administradores veem tudo; demais visualizadores autorizados não veem respostas individuais. |
| `SECRET` | Apenas administradores com permissão podem ver identidade e respostas individuais. |
| `ANONYMOUS` | As respostas são tratadas sem identidade para terceiros; administradores preservam rastreabilidade operacional mínima. |

Ao alterar sigilo, revise exportação CSV, resultados públicos, resultados de ministrante e exportações LGPD.

## Cuidados de manutenção

Ao mudar formulários:

- Atualize contratos compartilhados quando o payload mudar;
- Valide a UI administrativa e o fluxo público;
- Cubra os modos de resposta e sigilo afetados;
- Teste vínculos de evento e grande evento;
- Confira respostas inseridas dentro do fluxo de inscrição;
- Preserve compatibilidade de exportação CSV;
- Atualize Storybook quando houver novos estados.
