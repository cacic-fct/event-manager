# API

Trabalhamos com dois tipos de API: GraphQL e REST.

## GraphQL

O GraphQL é a base da API principal do sistema, utilizada para a maioria das operações.  
Ele faz com que a API seja flexível e eficiente, permitindo que os clientes solicitem exatamente os dados que precisam, além de facilitar no desenvolvimento de novas funcionalidades sem quebrar a compatibilidade com versões anteriores. Isto é, não é necessário criar novos endpoints para cada nova funcionalidade ou editar já existentes, como acontece com o REST.

Acesse o Apollo Sandbox em https://eventos.cacic.com.br/api/graphql para explorar a API GraphQL, testar consultas e visualizar a documentação automática gerada a partir do esquema GraphQL. 

Se você quer integrar a API pública do CACiC Event Manager em algum projeto, como a homepage da SECOMPP, procure pelas operações com o prefixo "Public".

:::tip[Dica]

Caso haja algum problema em requisitar o `introspection` do GraphQL, limpe os dados do site armazenados no navegador ou utilize uma guia anônima para acessar o Apollo Sandbox.

:::

### Code first

Utilizamos a abordagem code first para o desenvolvimento da API GraphQL, o que significa que o esquema GraphQL é gerado automaticamente a partir do código-fonte. Isso nos permite manter o esquema e a implementação sincronizados, além de facilitar a adição de novas funcionalidades sem a necessidade de atualizar manualmente o esquema.

Dessa forma, não deve-se editar o esquema GraphQL manualmente.

### Fronteiras

As operações GraphQL estão divididas por contexto:

| Contexto | Uso |
| --- | --- |
| Público | Consultas de calendário, eventos, grandes eventos, certificados públicos e dados visíveis sem administração. |
| Usuário atual | Inscrições, presença, perfil, carteira, notificações, formulários e dados que dependem da pessoa autenticada. |
| Administrativo | Painel de eventos, inscrições, presenças, certificados, formulários, pessoas, permissões, publicação e auditoria. |
| Interno | Integrações M2M que não devem ser chamadas pelo navegador público. |

### Autorização

Handlers administrativos devem usar `RequirePermissions(Permission.Recurso.Acao)` ou regras mais específicas de domínio.

Checks do frontend servem apenas para orientar a interface. O backend precisa validar novamente permissão, escopo, recurso congelado, visibilidade pública, janela de inscrição, janela de presença e demais regras aplicáveis.

### Contratos compartilhados

Quando uma operação pública ou M2M for consumida fora do monorepo, prefira evoluir os pacotes de contratos:

- `libs/event-manager-public-contracts`;
- `libs/event-manager-m2m-contracts`;
- `libs/event-manager-admin-contracts`, quando a mudança for compartilhada com o painel.

Atualize tipos, queries, fixtures e exemplos quando o payload mudar.

## REST

Damos preferência ao REST para comunicações M2M simples e requisições simples, como o login.

Acesse a documentação em https://eventos.cacic.com.br/api/docs para obter detalhes sobre os endpoints REST disponíveis, incluindo exemplos de requisições e de respostas.

### SSE

Utilizamos Server-Sent Events (SSE) para enviar notificações em tempo real aos clientes, como atualizações de presença ou mudanças de estado das vagas.

O SSE é uma tecnologia de comunicação unidirecional do servidor para o cliente, ideal para casos onde o cliente precisa receber atualizações contínuas sem a necessidade de enviar dados de volta ao servidor. Por conta disso, preferimos ele ao WebSocket.

Streams SSE devem ser opcionais para a experiência principal. A interface precisa continuar funcionando com atualização manual quando a transmissão de dados falhar.

## Cuidados

Ao adicionar uma operação:

- Defina se ela é pública, de usuário atual, administrativa ou M2M;
- Documente exemplos no Swagger quando for REST;
- Use tipos code first no GraphQL;
- Proteja o handler no backend;
- Cubra paginação e limites de busca;
- Adicione teste para autorização quando houver dado sensível;
- Atualize contratos externos quando consumidores fora do monorepo dependerem da mudança.
