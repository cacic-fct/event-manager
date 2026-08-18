---
title: Concessão de permissões
---

Conceda uma responsabilidade por meio de um cargo. Evite montar permissões diferentes para cada pessoa quando várias pessoas exercem o mesmo trabalho.

O Keycloak deve ser usado para acesso base ou para o bypass excepcional de super administrador. O conteúdo da responsabilidade fica no Event Manager.

## Antes de conceder

Defina:

- Qual trabalho a pessoa precisa executar;
- Em quais eventos ou grandes eventos;
- Durante qual período;
- Se a responsabilidade é individual ou pertence a uma equipe recorrente.

Escolha o menor alcance suficiente. Uma função temporária deve ter data de fim.

## 1. Escolha entre pessoa e grupo

Use atribuição direta quando a responsabilidade é exclusiva daquela pessoa.

Use um grupo de permissões quando várias pessoas compartilham o mesmo papel ou quando a equipe será reutilizada em outros períodos. Nesse caso, atribua o cargo ao grupo e gerencie os integrantes separadamente.

## 2. Escolha ou crie o cargo

Abra **Permissões > Gerenciamento de permissões > Cargos**.

Use um cargo existente quando ele representa exatamente a responsabilidade. Para uma nova responsabilidade, comece por um modelo ou por um cargo vazio e revise o conjunto antes de salvar.

Quando a interface indicar dependências, leia quais dados adicionais serão expostos. Aceite somente quando eles forem necessários para concluir o fluxo.

Use herança quando um cargo realmente contém outro como base duradoura. Não use herança apenas para economizar alguns cliques em uma concessão isolada.

## 3. Faça a atribuição

No cargo, adicione a pessoa ou o grupo responsável.

A pessoa pode ser encontrada mesmo sem conta vinculada. Nesse caso, a atribuição fica preparada e passará a funcionar quando uma conta for associada ao cadastro e receber acesso base no Keycloak.

## 4. Limite o escopo

Use escopo global apenas quando a responsabilidade não puder ser limitada a um evento, grupo de eventos ou grande evento.

Adicione o menor alvo que cobre o trabalho. Não replique escopos filhos quando um escopo pai já os cobre.

Se a mesma pessoa atua em alvos diferentes por períodos diferentes, use escopos separados em vez de ampliar toda a atribuição.

## 5. Defina a validade

A validade da atribuição controla o cargo como um todo.

A validade do escopo pode retirar apenas uma área de atuação antes do fim do cargo. Use esse recurso para responsabilidades sazonais ou por edição de evento.

Evite acessos sem fim quando existe uma data previsível de encerramento.

## 6. Revise e salve

Confira a barra de alterações não salvas.

Antes de salvar, valide pessoa ou grupo, cargo, escopos, datas e dependências. Não saia da página enquanto a revisão estiver pendente.

## 7. Verifique o resultado

Se é o primeiro acesso ao painel de administração e ele não aparece, solicite que a pessoa faça logout e login novamente.

Peça para a pessoa recarregar o painel e abrir **Permissões > Minhas permissões** para conferir o resultado.

Se o acesso continuar indisponível, confira o vínculo da conta e o papel `access` no Keycloak antes de ampliar o cargo.

## Alterar ou encerrar acesso

Para reduzir o alcance, remova o escopo desnecessário ou antecipe sua expiração.

Para encerrar uma responsabilidade individual, remova a atribuição ou a participação no grupo.

Arquive cargos e grupos somente quando eles não devem receber novas atribuições. O arquivamento preserva o histórico, mas não deve ser usado como forma implícita de revogar acessos ainda ativos.

## Super administrador

`super-admin` ignora cargos, escopos e validade.

Use-o apenas para manutenção, emergência ou responsabilidade irrestrita e permanente sobre a plataforma. Não o conceda para resolver problemas pontuais.

Leia [Permissões e recursos congelados](../../05-Interface%20administrativa/02-Permissões%20e%20recursos%20congelados.md).
