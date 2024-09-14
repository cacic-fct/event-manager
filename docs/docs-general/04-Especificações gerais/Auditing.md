---
title: Auditoria
sidebar:
  order: 2
---

O FCT App e a infraestrutura de hospedagem devem ser auditados periodicamente.

A auditoria do código-fonte do FCT App pode ser feita por qualquer pessoa por meio do repositório público no GitHub.

A auditoria da infraestrutura de hospedagem pode ser feita apenas por:

- Servidores da FCT da área de tecnologia;
- Diretores autorizados pela diretoria executiva das entidades estudantis do curso de Ciência da Computação:
  - Entende-se como diretoria executiva os cargos de presidente e vice-presidente;
  - Entende-se como entidades estudantis do curso o CACiC e a EJComp;
  - Apenas um diretor executivo é necessário para autorizar a auditoria. Não é necessário que diretores de ambas as entidades autorizem a auditoria;
- Alunos desenvolvedores que contribuíram significativamente para o projeto.
  - A interpretação de "contribuição significativa" neste caso específico fica a cargo da diretoria executiva de uma das entidades conforme critérios supracionados nesta lista.

Servidores ou alunos que não se encaixam nos critérios acima só podem realizar a auditoria do que está disponível publicamente no repositório do FCT App.

Isso se deve ao fato de que a infraestrutura de hospedagem contém informações pessoais dos usuários do FCT App e eventuais vulnerabilidades desconhecidas que podem ser exploradas.

Caso solicitado, a configuração do servidor deve ser disponibilizada para a auditoria.

### Lead developers

Os _lead developers_ exercem o papel de auditoria externa _voluntária_ para evitar o problema descrito na seção [deficiências evidentes](https://cacic.dev.br/docs/Recursos/Servidores/FCTDTIWEBXP01/Vulnerabilidades#deficiências-evidentes).  
Por serem externos e voluntários, não podem ser responsabilizados por problemas de segurança.

Seu trabalho é _preferencialmente_ passivo: por conta própria, podem revisar e sugerir mudanças para os responsáveis da infraestrutura e do código.

Lista de _lead developers_:

- Vazia

A lista de _lead developers_ deve ser mantida atualizada e divulgada publicamente pelo CACiC. Os membros devem ser ativos.

O acesso de um _lead developer_ perdura enquanto ele faz parte da lista.

O acesso deve ser garantido pelo CACiC e pela EJComp e decisões tomadas pelos _lead developers_ devem ser respeitadas pelas entidades.

#### _Founding lead developers_

Os _founding lead developers_ são um _superset_ ("superconjunto") dos _lead developers_.

Estes não podem ser depostos e não entram na contagem de metade mais um dos _lead developers_ para tomada de decisões.  
Podem renunciar voluntariamente, mas o nome permanecerá na lista com uma averbação. Não haverá renúncia automática.

Possuirão acesso irrestrito e vitalício de leitura e escrita a todos códigos-fonte, ao servidor e ao banco de dados os _founding lead developers_ a seguir:

- [@GuiBatalhoti](https://github.com/GuiBatalhoti)
- [@karoldm](https://github.com/karoldm)
- [@Salies](https://github.com/salies)
- [@willshobwish](https://github.com/willshobwish)
- [@Yudi](https://github.com/Yudi)\*

> \*[Detém a propriedade do FCT App](/Geral/Licenças).

Estas pessoas foram escolhidas por serem ex-alunos do curso de Ciência da Computação da FCT e por terem contribuído significativamente para o projeto.

_Founding lead developers_ podem embargar decisões ou reverter embargos de forma individual, mas preferencialmente tomam decisões em conjunto.

_Founding lead developers_ podem incluir ou remover pessoas no grupo de _lead developers_ sem restrições, mesmo que haja unanimidade contrária do grupo.

_Founding lead developers_ podem alterar estes termos sem restrições.

#### Adição e remoção de _lead developers_

Poderá haver a inclusão de novos _lead developers_ por decisão de metade mais um dos _lead developers_ atuais.

Poderá haver a renúncia voluntária de um _lead developer_ ou a deposição por decisão de metade mais um dos _lead developers_ atuais.

Após exauridas todas as tentativas de contato a um _lead developer_, ele será considerado renunciado após um prazo de 3 meses.

#### Competências

Os _lead developers_ possuem poderes irrestritos. Por exemplo, eles podem:

- Atualizar o código do FCT App e de suas dependências;
- Embargar o acesso de qualquer pessoa ao servidor;
- Remover o aplicativo do ar;
- Exigir correções de segurança dos encarregados de dados e infraestrutura;
- Impedir mudanças na licença do código do FCT App;
- Questionar a substituição do FCT App por outro projeto;
- Questionar mudanças da infraestrutura;
- Notificar o Departamento de Matemática e Computação e a Diretoria Técnica de Informática (DTI) sobre problemas de segurança.

Não compete aos _lead developers_:

- A responsabilidade de manter a infraestrutura de hospedagem do FCT App;
- A responsabilidade de manter o código do FCT App;
- A responsabilidade da segurança dos dados;
- Alterar as características dos _founding lead developers_.

Para alterar estas especificações de _lead developers_, é necessário a aprovação unânime dos _lead developers_.

Um _lead developer_ pode embargar decisões de outro _lead developer_ individualmente.

Para a reversão de um embargo, é necessário a aprovação de metade mais um dos _lead developers_ excluindo o embargado.

_Lead developers_ só podem embargar ou reverter embargos de _founding lead developers_ em unanimidade.

### Código

Conforme a [concessão do FCT App](/Geral/Licenças):

O FCT App é disponibilizado sob a licença `AGPL-3.0-only` e não pode ser relicenciado.  
O código do FCT App deve ser mantido em um repositório público no GitHub.

### Auditoria automática

#### CodeQL

O código do FCT App é verificado pelo CodeQL a cada _push_ no repositório.  
O CodeQL é uma ferramenta de análise estática de código que verifica a existência de vulnerabilidades.

#### Dependabot

O Dependabot verifica se há atualizações de dependências no repositório.

#### Mozilla Observatory

O [Mozilla Observatory](https://observatory.mozilla.org) é uma ferramenta que verifica a segurança do site e da hospedagem.  
O FCT App deve manter uma pontuação de segurança A+, exceto quando impossibilitado por limitações técnicas.

#### CSP Evaluator

O [CSP Evaluator](https://csp-evaluator.withgoogle.com/) é uma ferramenta que verifica a eficácia do Content Security Policy (CSP) do site.
