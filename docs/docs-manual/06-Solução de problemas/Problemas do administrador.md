---
title: Problemas do administrador
---

Resolva primeiro a origem do problema. Recarregar a tela pode atualizar o estado, mas não substitui a conferência de acesso, escopo, sincronização ou publicação.

## Não consigo entrar no painel

Confirme que o login foi concluído com a conta correta.

Depois, confira se a conta possui o acesso base do Event Manager no Keycloak. Uma atribuição interna pode existir sem liberar a entrada administrativa.

O papel `super-admin` não deve ser usado como correção rápida para uma pessoa que precisa apenas de uma responsabilidade limitada.

## Entro no painel, mas uma área não aparece

Abra **Permissões > Minhas permissões**.

Confira se o cargo ou grupo está ativo, se a validade já começou e se o escopo cobre o evento ou grande evento que será administrado.

Algumas áreas precisam ler dados relacionados. Um cargo que permite a ação principal, mas não suas dependências, pode continuar sem conseguir abrir o fluxo completo.

## Vejo o dado, mas não consigo alterar

A leitura e a atualização são responsabilidades diferentes.

Confirme também se o recurso está congelado, encerrado ou em um estado que impede aquela transição. A interface pode ocultar ou bloquear a ação mesmo quando o dado é visível.

Em torneios e outros dados versionados, uma alteração concorrente pode exigir recarregar e reaplicar a decisão sobre a versão atual.

## Uma concessão não produziu acesso

Verifique:

1. Se as alterações do workspace de permissões foram salvas;
2. Se a pessoa correta recebeu o cargo ou entrou no grupo;
3. Se a conta está vinculada àquele cadastro;
4. Se o acesso base existe no Keycloak;
5. Se atribuição e escopo ainda estão válidos;
6. Se a pessoa recarregou a sessão administrativa.

Uma pessoa sem conta vinculada pode receber a atribuição, mas ela permanece dormente até que o vínculo exista.

## Há presenças pendentes

Reconecte o dispositivo de coleta e aguarde a tentativa de sincronização antes de lançar registros novamente.

No painel, abra a revisão off-line, confira pessoa e evento e trate falhas finais. Não aprove em lote itens de contextos diferentes.

## O torneio ou a partida não aparece para o público

Confirme que o grande evento possui modo esportivo, que a modalidade e a inscrição estão prontas e que a partida foi publicada.

Salvar uma partida não a publica. Despublicar remove a visualização pública e desativa o uso normal do link de overlay.

Depois de publicar, abra a página pública em outra sessão para conferir o resultado.

## O overlay do OBS está vazio

A partida precisa estar publicada.

Gere novamente o link pelo construtor da operação da partida, atualize a fonte de navegador no OBS e confira se o identificador pertence à partida correta.

Use o modo de demonstração para separar um problema de layout de um problema de publicação ou dados.