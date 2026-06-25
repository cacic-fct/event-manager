# Publicação e pré-visualização

O fluxo de publicação é separado do fluxo de edição. Editores gravam o conteúdo administrativo; a publicação decide se o conteúdo derivado pode aparecer nas consultas públicas.

## Fonte de verdade

Eventos e grandes eventos persistem o estado de publicação. Grupos de eventos são tratados como agregadores: o estado apresentado no workspace é derivado dos eventos filhos.

## Transições

Publicar, agendar e despublicar passam pelo serviço de publicação. Ele centraliza:

- Validação de data de agendamento;
- Expansão de grupos e grandes eventos para os eventos filhos afetados;
- Escrita de metadados de publicação;
- Sincronização com Typesense;
- Auditoria.

## Agendamento

Publicações agendadas dependem de jobs no backend. A fila reaplica transições pendentes e também serve como reconciliação quando o processo ficou fora do ar no horário exato.

**O horário agendado não deve ser interpretado como garantia de renderização futura no frontend.** O estado materializado no backend continua sendo a referência para consultas públicas.

## Pré-visualização

Pré-visualizações usam o mesmo modelo público carregado pelas páginas reais. O backend cria uma sessão temporária no Redis e guarda apenas o hash do token no banco.

O token retornado ao navegador é opaco, temporário e específico para o usuário que criou a pré-visualização. A URL não deve carregar identificadores de usuário nem ser usada como mecanismo de compartilhamento público.

Quando o conteúdo já está publicado e não possui alterações salvas depois da publicação, o backend pode retornar o link público direto em vez de criar uma sessão temporária.

## Permissões

Operações de publicação usam as mesmas fronteiras de escopo de evento, grupo e grande evento, e ações em lote precisam cobrir os filhos que serão alterados.
