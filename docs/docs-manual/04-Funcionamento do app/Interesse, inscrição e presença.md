---
title: Interesse, inscrição e presença
---

# Interesse, inscrição e presença

**Quero ir** permite demonstrar interesse antes da abertura das inscrições. Não reserva vaga, não exige pagamento e não cria uma inscrição. A organização pode ativá-lo independentemente das inscrições em eventos, grupos de eventos e grandes eventos.

O botão não aparece para quem já está inscrito nem depois do encerramento do evento. As ações de inscrição também ficam ocultas quando o evento termina. O histórico de interesse é preservado quando a pessoa se inscreve: assim, a organização consegue distinguir inscrições diretas de inscrições precedidas por interesse.

Os eventos de interesse aparecem em **Meu dia**. Ao se inscrever em um grande evento, a pessoa vê quais atividades havia marcado com **Quero ir**, sem seleção automática de vagas. Presenças registradas aparecem em **Participações**, mesmo sem inscrição.

## Formulários

Cada vínculo de formulário permite selecionar um ou mais públicos:

- **Interessados ainda não inscritos**: pessoas que demonstraram interesse e ainda não possuem inscrição ativa naquele evento ou grande evento;
- **Inscritos**: pessoas com inscrição ativa;
- **Presentes**: pessoas cuja presença foi registrada.

Basta corresponder a um dos públicos selecionados. Um formulário apenas para interessados deixa de ser direcionado à pessoa quando ela se inscreve, sem apagar o interesse original. Essa regra também vale para as notificações de disponibilidade.

Um formulário inserido no fluxo de inscrição precisa incluir **Inscritos** entre os públicos selecionados.

## Conversão pela organização

A aba **Quero ir** do painel de inscrições mostra as manifestações separadamente das inscrições. A ação **Converter em inscrição** usa as regras normais de inscrição e mantém o histórico de interesse. Comprovantes e aprovações continuam sujeitos às regras do grande evento.

Quando já existe presença, sua classificação é reavaliada após a inscrição. A conversão não cria uma presença para quem não compareceu.

## Presença on-line e certificados

As regras são independentes. Nas configurações do evento, a organização define quem pode confirmar presença on-line. Nas seções de certificados dos eventos, grupos e grandes eventos, define separadamente as exceções para presentes não pagantes e não inscritos. Essas regras se aplicam a todas as configurações de certificados daquele destino.

Para confirmação de presença on-line:

| Regra | Requisito |
| --- | --- |
| Qualquer participante | Não exige inscrição. |
| Pessoas inscritas | Exige inscrição ativa. |
| Inscrição confirmada no grande evento | Exige inscrição ativa na atividade e confirmação da inscrição no grande evento. |
| Pessoas convidadas | Reservada para a futura gestão de convites; não concede elegibilidade automática. |

O registro on-line também depende de estar habilitado e dentro da janela de confirmação. Quando liberado para qualquer participante, pode ser iniciado pela página do evento, mesmo sem **Quero ir** ou inscrição.

As regras de elegibilidade não impedem a equipe autorizada de coletar presença. Os registros são preservados e classificados para auditoria, independentemente da emissão de certificados.

Por exemplo, um evento pode liberar confirmação on-line para qualquer pessoa e emitir certificados apenas para inscritos. Também pode emitir certificados para participantes sem inscrição cuja presença foi coletada pela equipe. A emissão continua respeitando os requisitos de presença, carga horária e faixas de preço configurados para o certificado.

Para presença on-line, eventos e grupos independentes usam **Pessoas inscritas** como padrão. Grandes eventos usam **Inscrição confirmada no grande evento**. Essa opção aparece apenas em grandes eventos e nas atividades ou grupos vinculados a eles. A regra on-line de uma atividade pode herdar a configuração do grupo ou do grande evento; a configuração de certificado permanece independente.

### Regras granulares de certificados

As exceções para não pagantes e não inscritos são independentes. Uma atividade de grupo só permite uma exceção quando o evento e o grupo a permitem. Para o certificado de um grande evento, a regra do grande evento também precisa permitir a mesma exceção. Um evento que não permite inscrições não passa a exigir inscrição para emitir certificados apenas porque a política on-line exige inscrição.

O certificado de um grande evento exige inscrição confirmada nesse grande evento, exceto quando ele não exige pagamento e permite a exceção para não pagantes. Em grandes eventos pagos, essa exceção fica desabilitada.

A avaliação preserva a ordem dos requisitos: a faixa de preço elegível da atividade é obrigatória; quando há pagamento exigido e não confirmado, aplica-se a exceção de não pagantes; nos demais casos, quando o evento permite inscrição e não existe inscrição na atividade, aplica-se a exceção de não inscritos. Assim, liberar uma exceção não libera faixas de preço excluídas.

No painel **Certificados**, o **Critério adicional de inscrição** começa em **Usar regras dos eventos**. É possível restringir uma configuração a pessoas inscritas ou com inscrição confirmada no grande evento. Esse critério nunca libera uma pessoa excluída pelas regras do evento ou grupo. As faixas de preço da configuração continuam sendo um filtro adicional, e as regras de certificados parciais e de conclusão de grupos são preservadas.

As configurações existentes mantêm as escolhas granulares salvas durante a migração, sem receber um novo requisito de inscrição automaticamente. Essas regras afetam certificados de participantes; certificados de palestrantes, funções esportivas e emissão manual seguem seus fluxos próprios.
