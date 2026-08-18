---
title: Permissões e recursos congelados
---

As permissões administrativas representam responsabilidades. O sistema combina cargos, grupos, escopos e validade para decidir quem pode agir, onde e por quanto tempo.

O Keycloak libera a entrada no painel. As autorizações de negócio são mantidas no Event Manager.

## Modelo mental

Um **cargo** reúne as permissões necessárias para uma responsabilidade.

Uma **atribuição** liga o cargo a uma pessoa ou a um grupo de permissões.

O **escopo** limita os dados alcançados pela atribuição.

A **validade** limita quando a atribuição ou um de seus escopos produz acesso.

Um **grupo de permissões** reúne pessoas que exercem uma responsabilidade recorrente. Ele não é o mesmo que grupo de eventos.

## Minhas permissões

A área **Minhas permissões** mostra o acesso efetivo da pessoa autenticada.

Ela combina cargos diretos, participação em grupos, herança entre cargos, escopos ativos e acessos externos. Use essa visão para entender o resultado, não para editar a autorização.

Os detalhes técnicos ficam recolhidos para diagnóstico. O catálogo completo não é reproduzido no manual porque a própria aplicação é a fonte de verdade.

## Gerenciamento de permissões

A área **Gerenciamento de permissões** organiza o trabalho por cargo, pessoa e grupo.

### Cargos

Comece por um modelo ou por um cargo vazio. Dê ao cargo um nome que represente a responsabilidade, revise as permissões e salve apenas o necessário.

Quando uma permissão depender de outras leituras, a interface informa a exposição adicional antes de incluí-las.

Permissões herdadas permanecem associadas ao cargo de origem. Em vez de copiar manualmente o mesmo conjunto para vários cargos, use a herança quando a relação de responsabilidade for duradoura.

Alguns cargos são predefinidos ou administrados externamente. Quando precisar de uma variação, crie ou duplique um cargo personalizado em vez de alterar a referência do sistema.

### Pessoas

A visão por pessoa mostra cargos diretos e participação em grupos.

Uma pessoa pode receber um cargo antes de ter uma conta vinculada. A atribuição fica preparada, mas não libera acesso até que a conta seja associada e receba a entrada administrativa no Keycloak.

### Grupos

Use grupos para equipes recorrentes, como uma comissão ou um conjunto de validadores.

Atribua cargos ao grupo e mantenha a lista de integrantes. A participação de cada pessoa também pode expirar, sem exigir a remoção do cargo compartilhado.

## Escopos

| Escopo | Efeito |
| --- | --- |
| Global | Alcança todos os registros compatíveis e as responsabilidades que não pertencem a um evento específico. |
| Grande evento | Alcança o grande evento escolhido e os dados associados que suportam esse vínculo. |
| Grupo de eventos | Alcança o grupo escolhido e os eventos relacionados quando a operação usa essa estrutura. |
| Evento | Alcança uma atividade específica. |

O sistema impede escopos incompatíveis ou redundantes. Um escopo pai pode tornar desnecessário adicionar seus filhos individualmente.

Cada atribuição pode ter sua própria validade. Cada escopo também pode expirar antes da atribuição, o que permite manter o cargo e retirar somente uma área de atuação.

## Alterações não salvas

O workspace mantém uma revisão antes de gravar.

Quando a barra de alterações não salvas estiver visível, use **Salvar** ou **Redefinir** antes de sair. Fechar a aba ou trocar de tela sem concluir descarta alterações não salvas.

## Arquivar, expirar e revogar

Expirar encerra o acesso na data prevista.

Remover uma atribuição retira o acesso daquela pessoa ou grupo.

Arquivar um cargo ou grupo impede novo uso normal, mas preserva sua referência para consulta e auditoria. Não use arquivamento como substituto de revogar uma atribuição que ainda está ativa.

## Recursos congelados

Eventos, grupos e grandes eventos antigos podem ficar protegidos contra atualização ou exclusão.

A permissão comum continua necessária. Além dela, a pessoa precisa estar autorizada a alterar recursos congelados.

Use esse acesso apenas para correções justificadas. Mudanças tardias podem afetar inscrições, presenças, resultados esportivos, comprovantes e certificados já emitidos.

## Quando o acesso não funciona

Confira a cadeia inteira:

1. A conta está autenticada?;
2. O Keycloak liberou a entrada administrativa?;
3. O cargo ou grupo está ativo?;
4. A validade já começou e não terminou?;
5. O escopo cobre o recurso?;
6. As dependências de leitura necessárias foram incluídas?;
7. O recurso não está congelado para aquela ação?

Para conceder acesso, leia [Concessão de permissões](../07-Procedimentos/Cargos/Concessão%20de%20permissões.md). Para o limite do Keycloak, leia [Permissões no Keycloak](../09-Keycloak/Permissões.md).
