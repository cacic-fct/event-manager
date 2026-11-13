# Agenda de manutenção

Os trabalhos com horário fixo do backend usam o fuso `America/Sao_Paulo`.

É necessário cruzar os horários de manutenção do backend com a agenda do servidor para evitar conflitos.

| Horário | Responsável | Tarefa |
| --- | --- | --- |
| 23:00 | Backend | Remove registros de auditoria que excederam o prazo de retenção |
| 23:20 | Backend | Remove rascunhos de eventos vencidos |
| 23:40, domingo | Backend | Desativa feeds de calendário administrativos inativos |
| 00:05 | Backend | Procura eventos próximos e agenda a atualização da previsão do tempo |

A tabela indica horários de início. Trabalhos atrasados por indisponibilidade ou fila podem executar depois do horário previsto. Rotinas que atendem prazos de eventos, reconciliam filas ou verificam pendências ao iniciar o backend seguem seus próprios intervalos.
