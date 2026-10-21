---
title: Inscrições
---

A tela de inscrições permite consultar, exportar, criar e ajustar inscrições.

Use essa tela para correções administrativas e conferências. Para a inscrição normal do participante, prefira o fluxo da interface pública.

## Eventos individuais

Em eventos individuais, selecione o evento antes de carregar inscrições ou exportar dados.

A criação manual localiza a pessoa por nome, e-mail, documento, telefone ou ID de usuário. Ela deve ser usada para corrigir casos específicos, não para substituir o fluxo normal de inscrição.

Se uma pessoa vinculada como palestrante ou ministrante aparecer inscrita no próprio evento, a tela sinaliza a situação. Em geral, isso deve ser revisado, pois palestrantes não devem ser tratados como participantes comuns para presença e certificado.

## Grandes eventos

Em grandes eventos, selecione o grande evento e carregue as inscrições antes de editar.

A tela permite:

- Criar inscrição manual;
- Editar status;
- Ajustar valor pago, data de pagamento e faixa de pagamento;
- Alterar eventos selecionados;
- Exportar inscrições;
- Importar inscrições por CSV;
- Acessar a validação de comprovantes quando houver pendências.

Alterar uma inscrição pode afetar vagas, fila, status de pagamento e emissão de certificados.

Uma inscrição confirmada pode emitir um bilhete quando essa regra estiver configurada para o evento. Para configurar, emitir manualmente, consultar ou transferir bilhetes, leia [Bilhetes](11-Bilhetes.md).

Leia [Fila de inscrições](../04-Funcionamento%20do%20app/Fila%20de%20inscrições.md) antes de fazer ajustes em massa.

## Importação por CSV

A importação de inscrições em grande evento exige:

- Uma coluna para identificar a pessoa;
- Uma coluna com os IDs dos eventos inscritos;
- Um status que será aplicado às linhas importadas.

O sistema pode criar pessoas automaticamente quando houver dados suficientes. Revise o resultado da importação, principalmente as linhas com falha e as pessoas criadas.

Quando possível, faça importações primeiro em ambiente local ou com um arquivo pequeno de conferência.

Se o grande evento tiver regras de atividades ou limites por faixa de pagamento, informe a faixa aplicável ao arquivo. Sem uma faixa informada, inscrições existentes preservam a faixa atual; novas inscrições precisam de uma faixa válida quando essas regras estiverem ativas. O CSV também respeita a seleção completa dos grupos e os limites da faixa.

Para transferir inscrições junto com configurações ou revisar diferenças antes de aplicar, use [Dados JSON](./Dados%20JSON.md). A importação permite revisar pessoas não encontradas ou ambíguas antes de salvar.

## Exportação

A exportação usa os dados carregados na tela.

Antes de baixar o CSV, confira se o evento ou grande evento correto foi carregado e se a lista exibida corresponde ao recorte desejado.
