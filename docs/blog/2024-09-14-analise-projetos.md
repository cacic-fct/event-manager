---
slug: analise-projetos
title: Análise de projetos de outras universidades
authors: yudi
tags: [self-hosted]
---

A fim de escolher as melhores tecnologias e os procedimentos para a reescrita do FCT App, a comissão de 2024 analisou projetos de outras universidades. A seguir, estão listados os projetos analisados, os problemas encontrados e as soluções propostas.

{/* truncate */}

## Projetos analisados

| Nome                                                                                                                  | Descrição                                            | Tecnologia  | Universidade      |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------- | ----------------- |
| [Semcomp](https://github.com/semcomp/semcomp/tree/670a964de8a7cf6fa01c34efbf37655d0f2583e0)                           | Site da Semana de Computação                         | NextJS + TS | ICMC-USP          |
| [Xnths/symcomp](https://github.com/Xnths/symcomp/tree/ecd79c39c1d312299cf5909b4d16c7e27af4291e)                       | Site do Simpósio da Computação                       | NextJS + JS | IME-USP           |
| [apoiobcc/site-semana-2023](https://github.com/apoiobcc/site-semana-2023)                                             | Site da Semana da Computação                         | NextJS + TS | IME-USP           |
| [apoiobcc/site-semana-2022](https://github.com/apoiobcc/site-semana-2022)                                             | Site da Semana da Computação                         | Vue + JS    | IME-USP           |
| [cecomp-rp/site](https://github.com/cecomp-rp/site)                                                                   | Site do Centro Estudantil da Ciência da Computação   | Handlebars  | FFCLRP-USP        |
| [eccjr/site-cacic-2023](https://github.com/eccjr/site-cacic-2023)                                                     | Site do Centro Acadêmico de Ciência da Computação    | Gatsby      | IBILCE-Unesp SJRP |
| [semac.cc](https://web.archive.org/web/20240912160235/https://semac.cc/)                                              | Site da Semana da Computação                         | NextJS      | IBILCE-Unesp SJRP |
| [seccomp.com.br](https://web.archive.org/web/20240912160401/https://seccomp.com.br/)                                  | Site da Semana da Computação                         | Vue         | IGCE-Unesp RC     |
| [petcompufc/petcompufc.github.io](https://github.com/petcompufc/petcompufc.github.io)                                 | Site do PET Computação                               | Gatsby      | UFC               |
| [secompufscar/site-secomp](https://github.com/secompufscar/site-secomp/tree/7d74d378daf150db6c3678181caedd0c8c4ccf52) | Site da Semana de Computação                         | Flask       | UFSCar            |
| [secompufscar.com.br](https://web.archive.org/web/20240812013048/https://www.secompufscar.com.br/)                    | Site da Semana de Computação                         | NextJS      | UFSCar            |
| [secompufscar/site-secomp-vue](https://github.com/secompufscar/site-secomp-vue)                                       | Site da Semana de Computação                         | Vue + JS    | UFSCar            |
| [secompufscar/site-secompbeta](https://github.com/secompufscar/site-secompbeta)                                       | Site da Semana de Computação                         | React       | UFSCar            |
| [pedrozle/semcomp-unir](https://github.com/pedrozle/semcomp-unir)                                                     | Site da Semana de Computação                         | NextJS + TS | UNIR              |
| [DevMobUFRJ/BandejApp](https://github.com/DevMobUFRJ/BandejApp/tree/196f62ae366b1ea2de52aecdfa10e34fe434eb51)         | Site dos Restaurantes Universitários                 | React       | UFRJ              |
| [caecomp-ufrn](https://github.com/caecomp-ufrn/site-ca)🥇                                                             | Site do Centro Acadêmico de Engenharia de Computação | Vue + JS    | UFRN              |

:::note[Nota]
Nem todos os projetos analisados estão listados, pois foram perdidos. :-(
:::

## Problemas encontrados

### Organização do projeto

- Projeto sem licença;
- Projeto com licença, mas sem arquivo `LICENSE`;
- Falta de documentação acessível:
  - Se alguma documentação existe, as instruções são insuficientes;
- Monorepo:
  - Projetos sem uso permanecem no repositório;
  - Divisão desnecessária de frontends.
- Commits sem padrão:
  - Commitlint não foi adicionado ou foi desativado posteriormente;
  - Commits com mensagens longas, vagas ou com emojis.
  - Commits vazios (sem alterações).

#### GitHub

- Uso desnecessário da língua inglesa:
  - Por quê escrever as instruções de desenvolvimento e descrições de issues em inglês se os desenvolvedores são brasileiros?
- Labels inadequadas:
  - Pouco explicativas;
  - Fixação de prazos por labels, o que deveria ser feito na aba de Projetos.
- Issues e PRs:
  - Sem labels;
  - Linguajar pouco direto;
  - PRs com muitas alterações não relacionadas;
- Aplicativos não usados continuam instalados;
- Desenvolvedores têm poderes na `main` do repositório ao invés do desenvolvimento acontecer em branches ou forks.

### Escolhas técnicas

- Uso do `npm` ao invés de soluções mais rápidas;
- Falta de Continuous Integration (CI);
- Técnicas de deploy estranhas e manuais:
  - Script dá `git pull && docker compose up --build` no servidor;
- Uso de frameworks muito nichados:
  - Handlebars;
  - Gatsby.

### Segurança

- Desenvolvedores têm acesso ao arquivo `.env` do backend;
- Publicação de chaves de API;
- Publicação na internet de banco de dados sem criptografia, com dados pessoais;
- Vazamento de informações pessoais ou sensíveis em capturas de telas;

### Qualidade e organização do código

- Desenvolvedores não testam antes do merge;
- Múltiplas pastas com o mesmo propósito, sem agrupamento de código relacionado;
- Sem tratamento de erros para requisições;
- Imagens não otimizadas somam-se significativamente ao tamanho do site:
  - Em um dos projetos, o tamanho total de um site ficou em 20 MB.
- Código antigo não removido:
  - Em um dos projetos, o TailwindCSS é importado três vezes no frontend, ora por CDN, ora por pacote;
- Falta de padronização:
  - Sem execução do Eslint ou do Prettier;
  - Uso misto de JavaScript e TypeScript:
    - Componentes ora com tipagem, ora sem (`.js` ou `: any`);
  - Componentes:
    - Grandes demais (500 linhas);
    - Pequenos demais (11 linhas que poderiam estar em um componente maior).
- Links quebrados (404);
- Branch da produção mais avançada que a de desenvolvimento;
- Passagens de dados (props) para _child-components_ sem sentido;
  - Texto passado para componente de uso único.

#### Interface do usuário

- Interface do usuário comum não mobile-first;
- Interface que não funciona em dispositivos com telas horizontais;
- Falta de compatibilidade com leitores de tela;
- Contraste inadequado;
- Reaproveitamento de componentes sem testes para averiguar o funcionamento da lógica em todos os locais;

## Conclusão 

A análise dos projetos permite identificar padrões de problemas recorrentes. Embora as tecnologias empregadas variem significativamente entre os projetos analisados, observou-se que as principais dificuldades encontradas não decorrem diretamente da escolha da stack tecnológica, mas da ausência de processos consistentes de desenvolvimento, documentação, revisão e manutenção.

Entre os problemas mais frequentes destacam-se a falta de documentação adequada, a inexistência de testes automatizados, a ausência de integração contínua, a adoção de procedimentos manuais de implantação, falhas de segurança decorrentes da exposição indevida de informações sensíveis e a carência de padrões de organização e qualidade de código. Tais fatores aumentam a complexidade de manutenção dos sistemas, dificultam a entrada de novos colaboradores e elevam o risco de regressões, vulnerabilidades e interrupções de serviço.

Nesse contexto, a adoção de Angular no frontend e NestJS no backend para o desenvolvimento do FCT App apresenta-se como uma alternativa tecnicamente adequada para mitigar diversos dos problemas identificados. Ambas as tecnologias fornecem estruturas arquiteturais bem definidas, fortemente baseadas em TypeScript, que favorecem a modularização, a padronização do código, a escalabilidade e a manutenção de longo prazo. Entretanto, a utilização dessas ferramentas não constitui, por si só, uma garantia de qualidade, embora colaborem para a construção de um sistema mais robusto e sustentável.

Dessa forma, conclui-se que o sucesso da reescrita do sistema depende não apenas da escolha de tecnologias modernas, mas também da implementação de mecanismos institucionais que assegurem a qualidade, a segurança e a sustentabilidade do software ao longo de seu ciclo de vida. O FCT App deve ser concebido como um projeto de manutenção contínua, orientado por boas práticas de desenvolvimento e governança, visando garantir sua evolução e utilização pelas futuras gestões da entidade.

### Por que o Angular e o NestJS?

Durante o processo de definição da arquitetura da reescrita do FCT App, também foram consideradas outras tecnologias amplamente utilizadas no desenvolvimento web. Embora todas apresentem qualidades relevantes e sejam adequadas para diferentes cenários, optou-se pela adoção de Angular e NestJS devido à maior aderência aos requisitos de organização, padronização e manutenção de longo prazo do projeto.

#### Next.js

O Next.js é um framework amplamente adotado para desenvolvimento de aplicações web baseadas em React, entretanto, a filosofia de desenvolvimento dele difere significativamente da adotada pelo Angular.

Enquanto o Angular é um framework completo (batteries included), o Next.js fornece uma base para construção de aplicações React, exigindo a adoção de bibliotecas adicionais para diversas funcionalidades consideradas fundamentais em aplicações corporativas. Entre elas estão formulários reativos, validação avançada de dados, gerenciamento de estado, internacionalização, injeção de dependências, gerenciamento de permissões, mascaramento de campos e diversos componentes de interface.

No Angular, recursos como Reactive Forms, validações síncronas e assíncronas, interceptadores HTTP, injeção de dependências, roteamento, guards, internacionalização e testes já fazem parte do ecossistema oficial e são desenvolvidos de forma integrada. Como consequência, existe uma padronização natural entre diferentes projetos Angular, reduzindo a quantidade de decisões arquiteturais necessárias durante o desenvolvimento.

Por outro lado, em aplicações Next.js é comum que cada equipe selecione diferentes combinações de bibliotecas para resolver os mesmos problemas. Por exemplo, formulários podem ser implementados utilizando React Hook Form, Formik ou outras soluções; gerenciamento de estado pode ser realizado com Redux, Zustand, Jotai ou Context API; autenticação pode ser construída com diferentes bibliotecas ou implementações próprias. Embora essa flexibilidade seja frequentemente considerada uma vantagem, ela também aumenta a complexidade arquitetural e dificulta a padronização do projeto ao longo do tempo.

Esse aspecto é particularmente relevante em um projeto acadêmico mantido por equipes com alta rotatividade de colaboradores. A cada nova gestão, desenvolvedores precisam compreender não apenas o framework principal, mas também todas as bibliotecas escolhidas anteriormente e as decisões arquiteturais associadas a elas. Em contrapartida, a natureza mais opinativa do Angular reduz a quantidade de tecnologias paralelas necessárias e facilita a transmissão de conhecimento entre diferentes gerações de mantenedores.

Além disso, o FCT App possui características típicas de uma aplicação administrativa (dashboard application), como autenticação, autorização, formulários complexos, regras de negócio, painéis de gerenciamento e operações CRUD. Para esse tipo de sistema, os recursos integrados oferecidos pelo Angular tendem a proporcionar maior produtividade e consistência arquitetural do que a abordagem mais modular e flexível do ecossistema React/Next.js.

Dessa forma, embora o Next.js seja uma excelente opção para diversos tipos de aplicações, o Angular foi considerado mais adequado para os objetivos do FCT App devido ao seu conjunto abrangente de funcionalidades integradas, maior padronização arquitetural e menor dependência de bibliotecas externas para implementação de recursos essenciais.

#### Spring Boot

O Spring Boot é uma das principais plataformas para desenvolvimento de aplicações corporativas em Java, reconhecida por sua robustez, maturidade e amplo conjunto de recursos para aplicações de grande porte.

Apesar dessas qualidades, sua adoção implicaria o uso de uma stack tecnológica distinta daquela empregada no frontend, exigindo conhecimento simultâneo de TypeScript e Java. Além disso, seria necessário a duplicação de código para lidar com a comunicação entre as camadas, como a definição de contratos de API, validação de dados e tratamento de erros, o que aumentaria a complexidade do projeto e dificultaria a manutenção ao longo do tempo. 

No contexto do FCT App, onde a equipe de desenvolvimento é frequentemente composta por estudantes em processo de aprendizado, a manutenção de uma linguagem única entre frontend e backend reduz a complexidade do projeto, facilita a colaboração entre os membros da equipe e diminui a curva de aprendizado para novos contribuidores.

Adicionalmente, diversas funcionalidades que motivam a adoção do Spring Boot em ambientes corporativos, como integrações complexas com sistemas legados e arquiteturas distribuídas de grande escala, não correspondem às necessidades do FCT App. Assim, os benefícios proporcionados pelo NestJS mostraram-se suficientes para os requisitos do projeto, com menor custo de desenvolvimento e de manutenção.

#### Express.js

O Express.js é um dos frameworks mais populares do ecossistema Node.js, sendo amplamente utilizado devido à sua simplicidade e flexibilidade.

Contudo, essa mesma flexibilidade pode representar uma desvantagem em projetos de longo prazo. O Express.js fornece apenas uma camada mínima de abstrações, delegando ao desenvolvedor decisões relacionadas à estrutura da aplicação, injeção de dependências, organização de módulos, validação, tratamento de erros e diversos outros aspectos arquiteturais.

Embora essa abordagem seja adequada para aplicações simples ou protótipos, ela aumenta a probabilidade de inconsistências estruturais em projetos colaborativos mantidos por múltiplas gerações de desenvolvedores. Frise-se que a análise dos projetos estudados demonstrou que a falta de padronização e organização é uma das principais causas de degradação da qualidade do software ao longo do tempo.

Nesse sentido, o NestJS apresenta vantagens significativas ao fornecer uma arquitetura inspirada em conceitos consolidados da engenharia de software. Essas características contribuem para a criação de um ambiente mais previsível, padronizado e adequado à manutenção contínua do sistema.

### Mecanismos de mitigação e de prevenção

Com base nos problemas identificados, propõem-se os seguintes mecanismos para reduzir riscos e promover a qualidade do FCT App.

#### Arquitetura modular e organização do código

A aplicação deve ser estruturada de forma modular tanto no frontend quanto no backend. No Angular, os componentes, serviços e funcionalidades devem ser organizados por domínio de negócio, enquanto no NestJS devem ser utilizados módulos independentes para encapsular responsabilidades específicas. Essa abordagem reduz o acoplamento entre partes do sistema e facilita sua manutenção e evolução.

#### Padronização e tipagem estática

Todo o projeto deve utilizar TypeScript com configurações rigorosas de tipagem. No backend, a comunicação entre cliente e servidor deve ser realizada por meio de contratos explícitos, utilizando DTOs (Data Transfer Objects) e mecanismos de validação automática. Essa prática reduz inconsistências entre camadas da aplicação e aumenta a confiabilidade do sistema.

#### Controle de qualidade automatizado

O processo de desenvolvimento deve incorporar ferramentas de análise estática e formatação automática de código, como ESLint e Prettier. Além disso, todas as alterações devem ser submetidas a verificações automatizadas antes da integração ao código principal, garantindo conformidade com os padrões estabelecidos pelo projeto.

#### Testes automatizados

A implementação de testes automatizados deve ser considerada um requisito fundamental do desenvolvimento. Recomenda-se a utilização de testes unitários para validação de regras de negócio, testes de integração para verificação da comunicação entre componentes e testes de interface para validação de fluxos críticos. Dessa forma, torna-se possível detectar regressões precocemente e aumentar a confiabilidade das novas funcionalidades.

#### Integração e entrega contínuas

A utilização de pipelines de Integração Contínua (CI) e Entrega Contínua (CD) permite automatizar processos de validação, compilação, testes e implantação. Como consequência, reduz-se a dependência de procedimentos manuais, minimizam-se erros operacionais e aumenta-se a previsibilidade das entregas.

#### Governança do repositório

O repositório deve adotar políticas de proteção para a branch principal, exigindo revisões por pull request, aprovação de alterações e execução bem-sucedida das verificações automatizadas antes da integração. Recomenda-se também a utilização de convenções padronizadas para mensagens de commit e organização de tarefas, facilitando a rastreabilidade das modificações realizadas.

#### Segurança da informação

Informações sensíveis devem ser armazenadas exclusivamente por meio de variáveis de ambiente, sem exposição em repositórios públicos. O backend deve empregar mecanismos de autenticação, autorização baseada em papéis e validação rigorosa das entradas recebidas. Adicionalmente, recomenda-se a realização periódica de auditorias de dependências e revisões de segurança.

#### Acessibilidade e experiência do usuário

A interface deve ser desenvolvida seguindo princípios de acessibilidade e de responsividade desde as etapas iniciais do projeto. Devem ser observadas diretrizes relacionadas a contraste visual, navegação por teclado, compatibilidade com leitores de tela e adaptação a diferentes tamanhos de dispositivo. Essas medidas ampliam a inclusão e melhoram a experiência dos usuários.

#### Otimização e manutenção contínua

A gestão adequada dos recursos estáticos, incluindo otimização de imagens, carregamento sob demanda (lazy loading) e remoção de dependências obsoletas, deve fazer parte do processo de manutenção contínua do sistema. Essa prática contribui para melhorar o desempenho da aplicação e reduzir sua complexidade operacional.
