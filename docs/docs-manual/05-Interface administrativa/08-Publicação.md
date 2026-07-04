---
title: Publicação
---

A aba de publicação controla quando eventos, grupos de eventos e grandes eventos aparecem na interface pública.

Ela não substitui as telas de edição. Use as telas de eventos, grupos e grandes eventos para alterar conteúdo, inscrição, certificado, pagamento e presença. Use a aba de publicação para decidir se esse conteúdo já pode ser divulgado.

## Estados

Um conteúdo pode estar em rascunho, agendado, publicado ou despublicado.

Publicar libera o conteúdo para consultas públicas, calendário, páginas de detalhe e busca. Despublicar remove o conteúdo dessas superfícies, mas não apaga o cadastro nem os dados operacionais.

Agendamento deve ser usado quando o conteúdo já está pronto, mas só deve aparecer a partir de uma data e hora específicas. O backend aplica a transição agendada e sincroniza a busca depois da mudança de estado.

## Hierarquia

Grandes eventos e grupos podem conter eventos filhos, mas a publicação não deve ser tratada como um único botão mágico.

Um grande evento publicado com filhos ainda não publicados pode aparecer incompleto. A aba mostra avisos para esse tipo de inconsistência e oferece ações em lote para publicar filhos ausentes, agendar o conjunto ou despublicar o conjunto.

Grupos de eventos não possuem publicação própria independente dos eventos filhos. O estado exibido para um grupo resume o estado dos eventos associados.

## Pré-visualização

A pré-visualização usa as mesmas páginas públicas de eventos, grupos e grandes eventos. Isso evita divergência entre o que o administrador revisa e o que o participante verá depois da publicação.

Quando o conteúdo já está publicado e não possui alterações relevantes depois da publicação, o sistema pode abrir o link público direto. Caso contrário, é criado um link temporário.

Links temporários de pré-visualização:

- exigem autenticação administrativa;
- são opacos e não carregam o ID do usuário na URL;
- expiram rapidamente;
- são registrados em auditoria.

Não compartilhe links temporários como se fossem links públicos permanentes.

## Agendamento

O horário indica a partir de quando o conteúdo deve ficar elegível para publicação, mas não será a hora exata em que ele aparecerá no app público. 

Publicações agendadas são processadas pelo backend em um regime de "melhor esforço". O horário de publicação pode ser atrasado por filas de tarefa longas ou falhas, mas o sistema tentará aplicar a publicação assim que possível.

Se um agendamento não aparecer no app público no horário esperado, atualize a tela e confira:

- Se o item ainda está agendado;
- Se o backend está em execução;
- Se o item tem alterações salvas depois do agendamento;
- Se a busca pública foi sincronizada;
- Se eventos filhos também precisavam ser publicados.

## Despublicação

Despublicar remove o conteúdo das consultas públicas, mas não apaga o cadastro administrativo.

Use despublicação quando:

- O conteúdo foi divulgado antes da hora;
- Há erro grave em algum campo;
- O evento foi cancelado;
- A organização ainda precisa revisar dados antes de expor ao público.