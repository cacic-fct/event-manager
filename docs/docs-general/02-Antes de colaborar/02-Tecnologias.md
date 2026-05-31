# Tecnologias

:::tip[Dica]
Para conhecer o hardware e os softwares utilizados na infraestrutura de hospedagem, consulte a seção `DevOps`.
:::


As tecnologias adotadas não foram escolhidas apenas por familiaridade ou popularidade, mas com base nas necessidades reais do projeto e nos problemas observados em versões anteriores.

Por representar, no mínimo, a quarta iteração desse tipo de solução, o projeto incorpora aprendizados acumulados ao longo do tempo, especialmente em relação a manutenção, escalabilidade, organização do código e evolução da plataforma. Também houve [análise de projetos similares de outras universidades](/blog/analise-projetos), com conclusões publicadas no blog da documentação.

Dessa forma, as decisões sobre as tecnologias buscam oferecer uma base mais sólida, sustentável e adequada para o crescimento futuro do sistema.

Assim, o sistema poderá ser desenvolvido, mantido e evoluído por muitos anos, sem a necessidade de reescrever o código do zero ou de fazer mudanças drásticas que comprometam a estabilidade do sistema, o que é especialmente importante em um projeto mantido por voluntários, com pouco tempo disponível.

## Angular

O Angular é um framework web mantido pelo Google, que é amplamente utilizado para criar aplicações web complexas e escaláveis em nível empresarial (_enterprise_). 

Ele é baseado em TypeScript, o que proporciona uma melhor experiência de desenvolvimento e maior segurança de dados, com recursos como tipagem estática e suporte a módulos.

Embora o React e/ou o Next.js sejam escolhas mais populares entre os alunos do curso, o Angular é um framework mais robusto e completo, que oferece uma estrutura sólida para o desenvolvimento de aplicações web complexas, além de ser mais fácil de manter e de evoluir a longo prazo, por conta das convenções e dos padrões de desenvolvimento dele.

Por exemplo, o Angular já fornece, de forma integrada, recursos essenciais para aplicações de maior porte e que são utilizados em um sistema de inscrição de eventos, como roteamento, injeção de dependências, formulários reativos, validação, comunicação HTTP, organização modular da aplicação e ferramentas oficiais para testes e build. Isso reduz a necessidade de escolher, aprender e integrar diversas bibliotecas externas para resolver problemas fundamentais da arquitetura do projeto.

Além disso, o Angular incentiva uma separação clara de responsabilidades entre componentes, serviços, módulos e rotas, o que facilita a organização do código conforme a aplicação cresce. Essa característica é especialmente importante neste projeto, pois a aplicação tende a envolver diferentes telas, fluxos, regras de negócio, consumo de APIs, o que pode tornar a manutenção contínua uma tarefa complexa.

Outro ponto relevante é a padronização: por possuir uma estrutura mais opinativa, o Angular ajuda a manter o projeto mais consistente entre diferentes desenvolvedores, evitando que cada parte da aplicação siga padrões muito distintos. Isso favorece a colaboração em equipe, a revisão de código e a evolução futura do sistema.

Por conta disso, o Angular não deve ser substituído por outros frameworks, mesmo que eles sejam mais populares ou mais fáceis.

## NestJS

O NestJS é um framework de desenvolvimento backend para Node.js, que é inspirado no Angular e segue uma arquitetura modular. Ele é baseado em TypeScript e é projetado para criar aplicações escaláveis e de fácil manutenção.

Como o projeto é organizado em um monorepo com Nx, o uso de TypeScript também no backend traz uma vantagem importante: a possibilidade de compartilhar tipos, interfaces, DTOs, utilitários e contratos entre diferentes partes da aplicação. Isso reduz a duplicação do código e ajuda a manter maior consistência entre frontend e backend, o que é importante em um projeto que envolve múltiplas pessoas, sem um líder técnico fixo, e que pode ter colaboradores com diferentes níveis de experiência.

Outro ponto importante é que o NestJS já oferece suporte nativo ou bem integrado a recursos essenciais em aplicações backend modernas, como validação de dados, autenticação, autorização, interceptadores, middlewares, tratamento de erros, documentação de APIs e integração com bancos de dados, sem necessidade de instalar outros pacotes externos.

No contexto deste projeto, o NestJS é adequado porque permite criar uma API robusta, segura e escalável, capaz de atender diferentes partes da aplicação e concentrar as regras de negócio de forma organizada. Sua estrutura também facilita a realização de testes e a futura expansão do sistema, caso novas funcionalidades sejam adicionadas.

Por ter sido inspirado no Angular, ele compartilha das vantagens de padronização, organização modular e facilidade de manutenção.

Por conta disso, o NestJS não deve ser substituído por outros frameworks, mesmo que a opinião do desenvolvedor seja de que outros frameworks sejam mais fáceis, mais modernos, mais populares, mais rápidos ou que "JavaScript é ruim".

## PostgreSQL

O PostgreSQL é um sistema gerenciador de banco de dados relacional, gratuito e de código aberto, sendo considerado o atual (2026) padrão ouro para bancos de dados relacionais. Ele é conhecido por sua robustez, confiabilidade, desempenho e conformidade com os padrões SQL.

No contexto do CACiC Event Manager, o PostgreSQL é especialmente adequado porque os dados do sistema possuem muitas relações entre si: um evento pode estar associado a participantes, inscrições, presenças, certificados, organizadores, permissões, pagamentos, filas de espera, atividades e grupos de eventos. Ou seja, os dados não existem de maneira isolada, mas sim conectados por diversas regras de negócio.

Em um banco não relacional orientado a documentos, como o MongoDB, os dados tendem a ser armazenados em estruturas mais flexíveis e menos rígidas. Essa flexibilidade pode ser vantajosa em alguns cenários, mas, neste projeto, poderia dificultar a garantia da integridade entre entidades. Por exemplo, seria mais complexo assegurar, de forma consistente, que uma inscrição sempre esteja associada a um evento existente, que um certificado seja emitido apenas para uma participação válida ou que uma presença não fique desvinculada de uma pessoa ou de uma inscrição.

Além disso, o modelo relacional facilita consultas que envolvem múltiplas entidades ao mesmo tempo, como verificar quais participantes estão inscritos em determinado evento, calcular carga horária para emissão de certificados, listar eventos pertencentes a um grupo ou validar a situação de uma inscrição. Esse tipo de operação é comum no projeto e se encaixa melhor em um banco relacional.

Ainda assim, a escolha pelo PostgreSQL não impede o uso de estruturas mais flexíveis quando necessário. Caso alguma parte do sistema precise armazenar dados menos estruturados ou configurações variáveis, o PostgreSQL oferece suporte ao tipo JSONB, o que permite armazenar e consultar dados em formato JSON dentro do próprio banco relacional.

Por conta disso, o PostgreSQL não deve ser substituído por outros bancos de dados.