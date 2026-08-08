# Esportes

O módulo de esportes estende a infraestrutura de eventos. Ele não é um segundo
sistema de agenda, presença, pagamento, certificados ou permissões.

## Reuso do domínio de eventos

| Esportes | Infraestrutura existente | Responsabilidade |
| --- | --- | --- |
| Torneio | Grande evento | Publicação, congelamento, inscrição paga, certificados e catálogo |
| Categoria esportiva | Grupo de eventos | Organização, formulários e escopo de permissões |
| Partida | Evento | Agenda, local, presença, calendário e ciclo público |
| Participação no torneio | Inscrição em grande evento | Cobrança, recibo e efetivação da inscrição |
| Jogador escalado | Presença do evento da partida | Check-in e evidência para certificados |

Cada entidade esportiva possui identidade própria e uma relação individual com
a entidade de eventos correspondente. Assim, o calendário e as páginas públicas
podem misturar eventos e partidas sem duplicar regras, enquanto placar, chave,
equipe, escalação e arbitragem permanecem no domínio esportivo.

Um grupo de eventos é, portanto, reutilizado como a base de uma categoria. Ele
não representa uma equipe nem uma fase do chaveamento: fases podem gerar várias
partidas e precisam de regras próprias de avanço.

## Entidades esportivas

- `SportsTournament`: configuração esportiva do grande evento, incluindo
  autoinscrição, múltiplas equipes por jogador e pontuação geral.
- `SportsCategory`: modalidade, divisão, formato de competição, regras de
  escalação, janela de inscrição e regras de placar.
- `SportsTeam`: equipe específica daquele torneio, com instituição, estado e
  logotipo.
- `SportsTeamMember`: vínculo da pessoa com a equipe e as modalidades aprovadas.
- `SportsRegistration`: entrada de uma equipe em uma categoria, respostas de
  formulário e situação de aprovação.
- `SportsMatch`: extensão esportiva do evento, com participantes, estado,
  cronômetro, placar e progressão.
- `SportsMatchRoster`: escalação versionada e específica da partida.
- `SportsOfficialAssignment`: árbitro, intermediador ou mesário. Os papéis são
  separados para certificados, mas compartilham a mesma autorização operacional.
- `SportsTeamChangeRequest`, `SportsPlayerApplication` e
  `SportsMatchAction`: filas de revisão para conteúdo não confiável.

Locais esportivos reutilizam locais de eventos. Informações específicas de uma
quadra, piscina ou mesa devem ficar na configuração esportiva apenas quando não
forem propriedades gerais do local.

## Confiança, privacidade e concorrência

Administradores com permissão podem alterar diretamente os recursos do seu
escopo. Representantes, capitães, técnicos, jogadores e oficiais são tratados
como autores não confiáveis:

- Alterações de representantes são deltas versionados e entram em revisão;
- Uma nova alteração parte da versão pendente mais recente, sem substituir
  silenciosamente edições concorrentes;
- Conflitos de revisão exigem decisão explícita do administrador;
- Documento, telefone ou e-mail informados por representantes são criptografados
  e não resolvidos antes da aprovação;
- A resposta pública nunca informa se uma identidade existe;
- A leitura de dados pessoais exige permissão específica e necessidade do
  contexto;
- Jogadores aparecem publicamente com primeiro e último nome;
- Oficiais aparecem com primeiro nome e inicial do último sobrenome;
- Escalações só ficam públicas depois do encerramento da partida.

Logotipos são objetos privados e permanentes no armazenamento S3. A aplicação
entrega uma representação pública somente após validar a publicação do torneio,
da categoria, da equipe e da partida relacionada.

## Inscrição e pagamento

Na autoinscrição, a pessoa escolhe uma equipe e as categorias desejadas. O
pedido entra em revisão e deve exibir o aviso:

> Inscrever-se não garante sua escalação.

Quando o torneio é pago, a aprovação habilita o pagamento, mas a participação
só se torna efetiva depois da confirmação. Quando a autoinscrição está
desabilitada, a inclusão aprovada pela equipe habilita automaticamente o envio
de recibo para a pessoa.

As regras de pagamento pertencem à inscrição do grande evento. O módulo
esportivo apenas decide quando habilitar a cobrança e quando a participação é
efetiva.

## Escalações e funções de equipe

A escalação pertence à partida, não à equipe nem à categoria. O vencedor pode
receber uma cópia inicial da escalação na próxima partida, mantendo edição e
revisão antes do novo jogo.

Representantes podem propor escalações. Capitães e técnicos aprovados da
modalidade podem editar a escalação e desistir antes do início, respeitando os
limites configurados para cada função. Permissões deixam de valer quando o
vínculo, a inscrição, a categoria ou o torneio não está efetivo.

## Operação de partida

O estado canônico da partida segue:

```text
SCHEDULED -> CHECK_IN -> LIVE -> REVIEW -> FINISHED
                                      \-> DRAW
                                      \-> CANCELED
```

`REJECTED` pertence à revisão de uma ação, não ao histórico público da partida.
Uma ação operacional pendente produz uma projeção provisória para atualização
ao vivo. A progressão do chaveamento, certificados e automações usam somente o
estado canônico aprovado.

Árbitros, intermediadores e mesários podem:

- Conferir jogadores e registrar presença;
- Iniciar, pausar e retomar o cronômetro;
- Registrar placar total, períodos, sets ou rodadas;
- Associar um ponto a uma pessoa escalada, quando habilitado;
- Encerrar como vitória, empate, W.O., desistência ou cancelamento;
- Solicitar reagendamento.

As ações carregam uma chave idempotente, uma revisão-base e o instante do
dispositivo. Isso permite fila offline, reenvio seguro e detecção de conflito
sem polling.

## Placar, classificação e chaves

Regras de placar são configuradas por categoria e não presumem futebol. Elas
definem precisão numérica, períodos, agregação, empate permitido, pontuação de
classificação e critérios de desempate.

Formatos suportados incluem eliminação simples, todos contra todos, grupos com
eliminatória, eliminação dupla e sistema suíço. A geração:

- Aceita ordenação manual ou sorteada;
- Representa folgas (`bye`) explicitamente;
- Valida que a origem e o destino pertencem à mesma categoria;
- Impede ciclos e avanço duplicado;
- Pode preencher vencedores automaticamente após aprovação;
- Permite correção administrativa com reconciliação dos efeitos posteriores;
- Mantém resultados por categoria e, opcionalmente, pontuação geral do torneio.

O administrador pode substituir decisões automáticas, mas toda substituição é
registrada.

## Tempo real e cache

Dados são carregados sob demanda. Não há polling.

Alterações publicam invalidações SSE por escopo, com cursor assinado,
`Last-Event-ID`, replay e detecção de lacunas. O cliente busca novamente apenas
o recurso invalidado. Projeções públicas nunca incluem o conteúdo confidencial
da fila de revisão.

Agregados públicos podem ser armazenados no Redis por pouco tempo. Toda mutação
relevante invalida o agregado; partidas ao vivo e cronômetros continuam sendo
projetados a partir do estado atual.

## Congelamento, auditoria e certificados

O congelamento do grande evento alcança torneio, categorias, equipes,
inscrições, chaves e partidas. Ações não administrativas são bloqueadas depois
do encerramento. Revisões e substituições administrativas continuam exigindo
permissão e deixam trilha de auditoria.

Certificados reutilizam modelos e personalização dos eventos. A evidência vem
de participação efetiva:

- Jogador: escalação aprovada e presença na partida;
- Árbitro, intermediador ou mesário: atribuição válida no horário da partida;
- Organizador: emissão manual autorizada.

Os papéis permanecem distintos no texto do certificado.

## Verificação mínima

Mudanças no módulo devem cobrir:

- Transições válidas e inválidas de partida;
- Idempotência, concorrência e reordenação de ações offline;
- Aprovação, rejeição, correção e reversão de resultados;
- Propagação e reconciliação de chaves;
- Formatos, folgas e critérios de desempate;
- Privacidade das identidades e das escalações;
- Escopos de permissão e congelamento;
- Inscrição paga, recibos e efetivação;
- Presença, calendário, roteamento e certificados;
- Replay SSE, invalidação de cache e falhas de infraestrutura;
- Consultas GraphQL, controladores públicos e esquema Prisma.
