---
title: Certificados
---

A tela de certificados trabalha com alvos de emissão: evento, grupo de eventos ou grande evento.

Antes de emitir, confira se inscrições, presenças, pagamento e regras de certificado estão corretos.

## Configurações

Cada alvo pode possuir uma ou mais configurações de certificado.

A configuração define:

- Nome público do certificado;
- Template;
- Público da emissão;
- Texto do certificado;
- Preenchimento automático do verso;
- Campos adicionais exigidos pelo template;
- Se a configuração está ativa.

Uma configuração inativa não deve ser usada como emissão regular. Use inativação para manter histórico ou preparar uma configuração antes da liberação.

## Público da emissão

O público da emissão define quem pode receber aquele certificado.

Para participantes, prefira corrigir inscrição e presença para que a emissão automática reflita o estado real do evento.

Para palestrantes e ministrantes, confira se as pessoas foram vinculadas ao evento correto e se o perfil de ministrante está adequado.

Emissão manual deve ser exceção, usada para correções ou certificados fora da regra automática.

## Emissão e publicação

Depois de conferir e salvar a configuração, use **Emitir e publicar agora**. O processamento acontece em segundo plano, e a tela mostra o andamento e o resultado.

Para atualizar certificados existentes, use **Reemitir agora**. Os IDs são preservados. A reemissão também inclui novos destinatários elegíveis.

O agendamento é opcional. Em **Quando emitir**, escolha **Agendar**, informe a data e a hora e confirme a emissão ou reemissão. A execução começa a partir desse horário, conforme a disponibilidade da fila. É possível cancelar enquanto o processamento não tiver começado. Se editar o conteúdo ou o público da configuração depois de agendar, cancele e faça um novo agendamento; solicitações com uma configuração alterada não são executadas.

A opção **Notificar somente os destinatários ao concluir** controla as notificações dessa emissão. As notificações são preparadas apenas depois que todo o lote termina com sucesso e somente para certificados novos ou atualizados. A revisão automática mantém a escolha da última emissão concluída. Uma falha parcial não envia a notificação de conclusão; o sistema tenta novamente e preserva o histórico de auditoria.

## Destinatários manuais

Em configurações manuais, adicione as pessoas à lista de destinatários. Salvar a lista não publica uma configuração nova: depois, emita imediatamente ou agende. A ação **Importar e emitir CSV** continua emitindo imediatamente.

Remover uma pessoa da lista revoga o certificado e a exclui das próximas emissões. Adicioná-la novamente restaura a elegibilidade; a emissão seguinte reutiliza o certificado e seu ID original. Se a pessoa tiver sido revogada por uma decisão administrativa separada, adicionar à lista não remove esse bloqueio.

## Certificados emitidos e revogados

A lista permite baixar certificados válidos e revogar emissões incorretas quando a permissão existir. A revogação torna o certificado indisponível para consulta e download e impede sua reemissão automática ou em lote.

Para desfazer uma revogação administrativa, use **Remover revogação e reemitir**. A elegibilidade é verificada novamente, e o ID original é mantido. Uma pessoa removida da lista manual precisa ser adicionada novamente antes de reemitir.

## Revisão automática e auditoria

Por padrão, a cada seis horas, o sistema revisa configurações ativas que já emitiram certificados ou concluíram uma publicação, incluindo as manuais. A revisão inclui pessoas que passaram a ser elegíveis, atualiza os dados dos certificados e invalida certificados que perderam a elegibilidade. Configurações novas ainda não publicadas não são emitidas por essa revisão.

O intervalo pode ser configurado com `CERTIFICATE_RECONCILIATION_INTERVAL_HOURS` (de 1 a 168 horas). Os lotes gravam um destinatário por vez; solicitações explícitas têm prioridade sobre a recuperação automática. Passagens automáticas sem alterações não geram entradas na auditoria.

Adições e remoções de destinatários, solicitações, cancelamentos, início, conclusão e falha dos lotes, emissões, reemissões e revogações são registrados na auditoria com o responsável ou a identificação do sistema.

Use operações globais apenas quando a correção precisa atingir muitos alvos. Antes disso, revise as configurações, pois a ação pode afetar certificados em escala ampla.