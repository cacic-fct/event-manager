# Concessão de permissões

As permissões administrativas do Event Manager são concedidas pelo painel de pessoas. O Keycloak deve ser usado apenas para liberar o acesso base ao sistema ou para conceder o bypass de super administrador.

## Antes de conceder

Antes de liberar qualquer acesso:

- Confirme que a pessoa possui uma conta vinculada no Event Manager;
- Confirme que o usuário possui `event-manager#access` no Keycloak;
- Escolha o menor escopo suficiente para a responsabilidade;
- Defina uma data de fim quando o acesso for temporário;
- Evite `event-manager#super-admin`, exceto para manutenção, emergência ou pessoas com responsabilidade irrestrita pelo sistema.

Para visualizar e gerenciar concessões, o administrador também precisa das permissões de gestão de permissões no Event Manager:

- `permission-grant#read` e `person#read` para consultar concessões;
- `permission-grant#create` para criar concessões;
- `permission-grant#update` para alterar validade ou escopo;
- `permission-grant#delete` para revogar concessões.

## Concedendo permissões

1. Acesse a "Área Restrita".
2. Abra a aba "Pessoas".
3. Busque e selecione a pessoa que receberá o acesso.
4. No painel de detalhes, localize "Permissões do Event Manager".
5. Se a pessoa não possuir usuário vinculado, vincule ou crie a conta antes de continuar.
6. Escolha um preset ou selecione uma categoria e permissões manualmente.
7. Escolha o escopo da permissão.
8. Quando o escopo não for global, selecione o evento, grupo de eventos ou grande evento correspondente.
9. Preencha "Válida a partir de" e "Válida até" quando o acesso precisar ser agendado ou temporário.
10. Clique em "Adicionar à revisão".
11. Revise a lista de concessões que serão salvas.
12. Clique em "Salvar permissões".

As concessões aparecem com status "Ativa", "Agendada" ou "Expirada". Uma concessão expirada não autoriza novas operações.

## Escolhendo o escopo

| Escopo | Quando usar |
| --- | --- |
| Global | Para responsabilidades que precisam valer no sistema inteiro ou para permissões que só podem ser globais, como gestão de pessoas, resolução de duplicidades e gestão de permissões. |
| Grande evento | Para comissões que administram um grande evento e seus fluxos de inscrição, comprovantes, presenças ou certificados. |
| Grupo de eventos | Para responsabilidades sobre um grupo independente de eventos. |
| Evento | Para responsabilidades limitadas a um evento específico, como coleta de presença ou ajuste pontual. |

Algumas permissões são sempre globais. Quando uma permissão selecionada exigir escopo global, a interface limita a escolha automaticamente.

## Usando presets

Os presets são atalhos para conjuntos comuns de permissões. Antes de salvar, a interface mostra as permissões incluídas e os dados limitados que cada uma pode expor.

Use presets quando a responsabilidade combinar com um destes casos:

- "Administrador de grande evento";
- "Validador de comprovantes";
- "Coordenador de presenças";
- "Operador de certificados";
- "Gestor de pessoas".

Quando a responsabilidade for menor que o preset, selecione as permissões manualmente. O preset deve acelerar concessões recorrentes, não substituir a análise de necessidade.

## Alterando ou revogando

Para alterar uma concessão, clique no ícone de edição, ajuste escopo ou validade e salve.

Para revogar, clique no ícone de remoção. A revogação remove a concessão ativa do usuário, mas preserva o histórico interno da operação.

Quando o acesso era temporário e já possui data de fim correta, não é necessário remover manualmente após a expiração.

## Conferência

Depois de conceder, peça para a pessoa recarregar o painel administrativo. Se a tela ainda indicar permissão ausente, confira:

- Se `event-manager#access` está presente no Keycloak;
- Se a concessão foi salva para o usuário correto;
- Se a pessoa selecionada está vinculada ao mesmo usuário;
- Se a validade já começou;
- Se o alvo escolhido cobre o recurso acessado;
- Se a tela precisa de permissões adicionais para dados relacionados.
