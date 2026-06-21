# Painel de pessoas

O administrador com permissões de `person` pode acessar o cadastro de todas as pessoas no sistema, onde é possível visualizar e editar registros de pessoas.

A partir do painel de pessoas, o administrador pode realizar operações como:

- Editar informações pessoais, como nome, e-mail, CPF e telefone, desde que a pessoa não possua um usuário vinculado. Caso haja um usuário vinculado, as informações pessoais devem ser editadas no CACiC Account Manager, para garantir a consistência dos dados.
- Editar a biografia de palestrantes, que é a descrição disponibilizada na API pública;
- Visualizar as presenças e inscrições associadas a cada pessoa.

## Permissões do Event Manager

Quando a pessoa possui um usuário vinculado, o painel exibe a seção "Permissões do Event Manager". Essa seção permite consultar, conceder, editar e remover concessões administrativas gravadas no próprio Event Manager.

As permissões são concedidas ao usuário vinculado, não apenas ao cadastro de pessoa. Por isso, uma pessoa sem usuário vinculado não pode receber permissões administrativas.

A seção permite:

- Aplicar presets de responsabilidades comuns;
- Selecionar permissões manualmente por categoria;
- Limitar a concessão a um evento, grupo de eventos ou grande evento;
- Definir início e fim de validade;
- Revisar várias concessões antes de salvar;
- Consultar permissões ativas, agendadas ou expiradas;
- Remover concessões que não devem mais autorizar operações.

Para o passo a passo, consulte [Concessão de permissões](../07-Procedimentos/Cargos/Concessão%20de%20permissões.md).
