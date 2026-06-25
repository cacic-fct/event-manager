# Entenda a estruturação

Há três tipos principais de estruturas no sistema: Event, Event Group e Major Event. Cada uma possui um propósito diferente e regras específicas.

É fundamental compreender as diferenças e relações entre elas para evitar erros e complicações futuras.

Diagrama estrutural:

```
Standalone Event

Standalone Event Group
├── Event
└── Event

Major Event
├── Event
├── Event
└── Event Group
    ├── Event
    └── Event
```


# Event

O Event é a unidade mínima do sistema. Ele representa uma atividade individual, contendo ao menos:

- Título;
- Data e hora de início.

Um Event é obrigatoriamente gratuito.

Um Event pode:

- Existir sozinho (Standalone Event);
- Fazer parte de um Event Group;
- Fazer parte diretamente de um Major Event.

Eventos não possuem filhos. Ou seja, um Event nunca contém outros Events.

## Standalone Event

Um Standalone Event é um evento independente, sem relação estrutural com outros eventos.

Ele não faz parte de um grupo e não pertence a um Major Event.

Standalone Events também podem ser utilizados para exibir eventos que não se encaixam em nenhuma estrutura, mas que ainda assim devem ser divulgados.  
Por exemplo, embora a Ingressada possua eventos relaciondos entre si, ela não requer inscrição para participar, logo, os eventos dela podem ser cadastrados como Standalone Events.

### Uso correto

- Palestra isolada;
- Minicurso de um único dia;

### Exemplo

- `Palestra: Introdução ao Rust`
- `Ingressada: Palestra de Abertura`

---

# Event Group

O Event Group agrupa Events que possuem forte dependência entre si e que devem ser tratados como uma única experiência.

Normalmente, ele é utilizado quando um evento foi dividido em múltiplas partes, dias ou horários.

A inscrição em um dos Events do grupo implica automaticamente na inscrição em todos os demais Events do grupo.

Um Event Group:

- deve possuir pelo menos dois Events;
- pode ser Standalone;
- pode fazer parte de um Major Event;
- não pode conter outros Event Groups;
- não pode conter Major Events.

## Uso correto

Use Event Group quando os eventos representam partes do mesmo conteúdo.

### Exemplo

- `Minicurso de React - Dia 1`
- `Minicurso de React - Dia 2`


Nesse caso, os participantes devem estar inscritos em todas as partes do minicurso.

## Uso incorreto

```
Simpósio de Exemplo
├── Workshop de LaTeX
└── Fundamentos da Matemática
```

Apesar de relacionados, estes eventos não possuem dependência entre si.

Participar de um deles não implica participação no outro.

Neste caso, deve-se utilizar um Major Event, e não um Event Group, mesmo que ele seja gratuito.

# Standalone Event Group

Um Standalone Event Group é um grupo de eventos relacionados que não pertence a um Major Event.

---

# Major Event

O Major Event agrupa eventos relacionados entre si e podem ser pagos ou gratuitos.

Um Major Event implica na necessidade do usuário inscrever-se para participar dos eventos que fazem parte dele.

Ele é utilizado para centralizar a organização de eventos que compartilham um contexto comum, mas que não possuem dependência entre si. Isto é, uma única inscrição em um Major Event pode incluir a participação em múltiplos eventos, mas os participantes não são obrigados a participar de todos os eventos do Major Event.

Um Major Event pode conter:

- Events;
- Event Groups.

Um Major Event não pode conter:

- Outros Major Events.

## Uso correto

Utilize Major Event para representar:

- Semanas acadêmicas;
- Simpósios;
- Congressos;
- Grandes eventos compostos por múltiplas atividades independentes.

### Exemplo

```
SECOMPP
├── Palestra de IA
├── Workshop de LaTeX
├── Mesa-redonda de Carreira
└── Minicurso de React
    ├── Dia 1
    └── Dia 2
```

Neste exemplo:

- As atividades pertencem ao mesmo contexto, embora sejam independentes entre si;
- Os participantes podem escolher apenas algumas atividades.

## Uso incorreto

```
Ingressada
├── Palestra de Abertura
├── Encontro com o Movimento Estudantil
└── Encontro com a coordenação
    ├── Tarde
    └── Noite
```

Como a Ingressada não exige inscrição, para usar o sistema como uma espécie de calendário para divulgar os eventos, basta cadastrá-los como Standalone Events, sem a necessidade de um Major Event.

---

# Diferença entre Event Group e Major Event

A diferença principal está na dependência entre os eventos.

## Event Group

Use quando:

- Os eventos representam partes do mesmo conteúdo;
- A inscrição _deve_ ocorrer em conjunto;
- Há dependência entre participação e progressão.

### Exemplo

```
Minicurso de Python
├── Parte 1
└── Parte 2
```

## Major Event

Use quando:

- Os eventos apenas compartilham um contexto organizacional;
- Os participantes podem escolher atividades individualmente;
- Não existe dependência entre os eventos.

### Exemplo

```
SECOMPP
├── Workshop de Docker
├── Palestra de IA
└── Mesa-redonda
```

---

# Event x Major Event

## Event

- Sempre gratuito;
- Representa uma atividade individual;
- Não contém outros eventos.

## Major Event

- Pode ser gratuito ou pago;
- Funciona como agregador;
- Pode conter Events e Event Groups.

---

# Duplicação

Eventos, grupos de eventos e grandes eventos podem ser duplicados para acelerar a criação de eventos parecidos ou eventos de grupos.

A duplicação serve para copiar configuração reutilizável, não histórico operacional. Inscrições, presenças, comprovantes, certificados emitidos, revisões e dados de auditoria não são copiados.

Em eventos, o código de presença on-line não é copiado. Gere ou configure um novo código antes de liberar a coleta na cópia.

Copiar ministrantes, certificados, inscrição, pagamento, presença, local ou visibilidade depende das opções escolhidas no diálogo e das permissões do usuário. Quem copia precisa de permissões para ler a parte copiada no item original e para criar essa parte no destino.
