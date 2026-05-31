# API

Trabalhamos com dois tipos de API: GraphQL e REST.

## GraphQL

O GraphQL é a API principal do sistema, utilizada para a maioria das operações.
Ele é flexível e eficiente, permitindo que os clientes solicitem exatamente os dados de que precisam, além de facilitar no desenvolvimento de novas funcionalidades sem quebrar a compatibilidade com versões anteriores.

Acesse o Apollo Sandbox em https://eventos.cacic.dev.br/api/graphql para explorar a API GraphQL, testar consultas e visualizar a documentação automática gerada a partir do esquema GraphQL. 

Se você quer integrar a API pública do CACiC Event Manager em algum projeto, como a homepage da SECOMPP, procure pelas operações com o prefixo "Public".

:::tip[Dica]

Caso haja algum problema em requisitar o `introspection` do GraphQL, limpe os dados armazenados no navegador ou utilize o uma guia anônima para acessar o Apollo Sandbox.

:::

### Code first

Utilizamos a abordagem code first para o desenvolvimento da API GraphQL, o que significa que o esquema GraphQL é gerado automaticamente a partir do código-fonte. Isso nos permite manter o esquema e a implementação sincronizados, além de facilitar a adição de novas funcionalidades sem a necessidade de atualizar manualmente o esquema.

Dessa forma, não deve-se editar o esquema GraphQL manualmente.

## REST

Damos preferência ao REST para comunicações M2M simples e requisições simples, como o login.

Acesse a documentação em https://eventos.cacic.dev.br/api/docs para obter detalhes sobre os endpoints REST disponíveis, incluindo exemplos de requisições e de respostas.

### SSE

Utilizamos Server-Sent Events (SSE) para enviar notificações em tempo real aos clientes, como atualizações de presença ou mudanças de estado das vagas.

O SSE é uma tecnologia de comunicação unidirecional do servidor para o cliente, ideal para casos onde o cliente precisa receber atualizações contínuas sem a necessidade de enviar dados de volta ao servidor. Por conta disso, preferimos ele ao WebSocket.
