---
title: Sobre o projeto
---

## O que é o CACiC Event Manager?

O CACiC Event Manager é um aplicativo web desenvolvido pelo CACiC para a comunidade de alunos da FCT-Unesp.  
Em comunicações para comunidade, deve-se usar o nome "CACiC Eventos", para facilitar a compreensão do público.

Ele é um sistema que facilita e automatiza etapas do gerenciamento de eventos, como inscrição, emissão de certificados e coleta de presença, sempre com foco em eventos do curso de Ciência da Computação, como minicursos avulsos ao longo do ano e eventos maiores, como a SECOMPP, mas sem deixar de ser flexível para atender a outros tipos de eventos.

Em sua forma antiga, com o nome de "FCT App", ele foi adotado pelos alunos e pelos professores na SECOMPP por 3 edições, em substituição ao antigo [SYSCOMPP](https://github.com/cacic-fct/syscompp), que era um sistema feito com tecnologias mais antigas e que era hospedado em um servidor obsoleto.  
O FCT App era mais rápido, mais seguro, mais fácil de usar e de manter, já que está próximo das tecnologias mais utilizadas atualmente.

Embora o FCT App tenha atendido bem a SECOMPP, sem nenhuma ocorrência maior com o sistema em si, o projeto foi descontinuado, pois a escolha do Firebase como provedor de backend e de hospedagem não foi adequada: os limites do plano gratuito eram rapidamente atingidos, o que resultava em custos que alunos precisavam arcar com, sem repasse de valores da SECOMPP; e a cobrança por leituras, escritas do Firestore e por execução de Cloud Functions resultaram na implementação inadequada dos formulários, que eram enviados sem verificações adequadas.

O CACiC Event Manager é a evolução do FCT App, com um backend próprio e hospedagem em um servidor dedicado próprio, o que permite que o projeto seja mantido de forma sustentável, com código mais robusto e sem custos para os alunos.

### Motivações

1. Simplificar o fluxo de inscrição em eventos:
    - O CACiC Event Manager permite que o usuário faça a inscrição em um evento com poucos cliques, sem precisar preencher formulários extensos e repetitivos.
1. Emitir certificados de participação mais rapidamente:
    - Antes, certificados demoravam vários semestres para serem emitidos ou nem eram emitidos.
    - Os responsáveis pela emissão de certificados precisavam:
      - Compilar manualmente os dados de presença, carga horária e outras informações, o que era demorado e propenso a erros;
      - Enviar certificados um a um por e-mail, o que resultava em centenas de e-mails enviados com texto e anexos, com risco de falhas e atrasos.
1. Abolir o uso de papel, seja na confecção de crachás, certificados ou na coleta de presença:
    - As presenças eram computadas manualmente;
    - Os papéis das listas de presenças eram perdidos;
    - Crachás comprometiam parte significativa do orçamento de eventos e geram lixo desnecessário.

### Alterações com o tempo

Antes, o FCT App possuia o propósito de ser um "hub" completo para os alunos da FCT, com tudo em um só lugar.

No entanto, com o objetivo de direcionar o projeto para um caminho mais focalizado e sustentável, com o tempo, projetos foram desmembrados do FCT App:

- [Manual do calouro](https://cacic-fct.github.io/manual-do-calouro):
  - [Página do calouro](https://cacic-fct.github.io/manual-do-calouro/pagina-do-calouro/);
  - [Página de contatos das entidades](https://cacic-fct.github.io/manual-do-calouro/contatos/).

O CACiC Event Manager continuou com essa tendência e se concentrou exclusivamente em ser um aplicativo para eventos, com o objetivo de ser mais fácil de manter e de evoluir, além de ser mais fácil para os usuários entenderem o propósito do aplicativo.

Por exemplo, o gerenciamento do cadastro e as informações de perfil foram delegadas ao [CACiC Account Manager](https://github.com/cacic-fct/account-manager).

### Tecnologias escolhidas

Como relatado anteriormente, o CACiC Event Manager é, no mínimo, a quarta iteração de um sistema de inscrições para a SECOMPP.

O projeto aprendeu com as experiências anteriores e, por isso, as escolhas técnicas foram feitas de forma mais consciente, visando a sustentabilidade do projeto a longo prazo.

Todas as escolhas possuem justificativas técnicas, que estão listadas na página de [Tecnologias](./02-Antes%20de%20colaborar/02-Tecnologias.md), e não devem ser questionadas ou alteradas sem uma justificativa igualmente sólida.

## Sem fins lucrativos (non-profit)

O CACiC Event Manager é um projeto sem fins lucrativos e não pode ser utilizado para fins comerciais ou para auxiliar em atividades que visem lucro particular.
