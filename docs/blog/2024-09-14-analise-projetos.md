---
slug: analise-projetos
title: Análise de projetos de outras universidades
authors: yudi
tags: [self-hosted]
---

A fim de escolher as melhores tecnologias e os procedimentos para a reescrita do FCT App, a comissão de 2024 analisou projetos de outras universidades. A seguir, estão listados os projetos analisados, os problemas encontrados e as soluções propostas.

<!-- truncate -->

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

:::note
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
  - Divisão desnecessária de frontends (sem a aplicação de uma estrutura de microfrontends);
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
- Desenvolvedores têm poderes no repositório ao invés do desenvolvimento acontecer em forks.

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
- Publicação de banco de dados sem criptografia;
- Vazamento de informações pessoais ou sensíveis em capturas de telas;

### Qualidade e organização do código

- Desenvolvedores não testam antes do merge;
- Múltiplas pastas com o mesmo propósito;
- Sem tratamento de erros para requisições;
- Imagens não otimizadas somam-se significativamente ao tamanho do site:
  - Em um dos projetos, o tamanho total de um site ficou em 20 MB.
- Código antigo não removido:
  - Em um dos projetos, o TailwindCSS é importado três vezes no frontend, ora por CDN, ora por pacote;
- Falta de padronização:
  - Sem execução do Eslint ou do Prettier;
  - Uso misto de JavaScript e TypeScript:
    - Componentes ora com tipagem, ora sem;
  - Componentes:
    - Grandes demais (500 linhas);
    - Pequenos demais (11 linhas que poderiam estar em um componente maior).
- Links quebrados (404);
- Branch da produção mais avançada que a de desenvolvimento;
- Passagens de dados (props) para _child-components_ sem sentido;

#### Interface do usuário

- Interface do usuário comum não mobile-first;
- Interface não funciona em dispositivos com telas horizontais;
- Falta de compatibilidade com leitores de tela;
- Contraste inadequado;
- Reaproveitamento de componentes sem testes para averiguar o funcionamento da lógica em todos os locais;
