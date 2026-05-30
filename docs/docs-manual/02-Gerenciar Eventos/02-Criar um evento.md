---
title: Criar um evento
---

## Antes de tudo

Esteja seguro que você entendeu a [estruturação dos eventos no sistema](./00-Entenda%20a%20estruturação.md) para evitar erros e complicações futuras.

**O evento é parte de um grande evento?**

Se o evento faz parte de um grande evento, crie o grande evento _antes_ de criar os eventos que o compõem.

**O evento é dividido em partes ou dias diferentes?**

Se um evento está dividido em várias partes (ex: dias diferentes para um mesmo minicurso), crie um grupo de eventos para agrupá-los _antes_ de criar os eventos individualmente.

## Campos do formulário

### Identidade


#### Emoji

É o ícone do evento. Insira somente 1 (um) emoji, sem texto.

#### Tipo

Palestra, minicurso ou "outro".

#### Descrição curta

A descrição curta é exibida embaixo do nome do evento na lista de eventos do calendário.

O campos pode ser usado para o subtítulo do evento ou para indicar o local, público-alvo, palestrante ou ministrante.

#### Descrição

A descrição é exibida na página de detalhes do evento. Use esse campo para fornecer informações mais detalhadas sobre o evento, como o conteúdo programático, a biografia dos palestrantes e outras informações relevantes. 

Não use este espaço para descrever o local do evento.

### Grupo do evento

Se o evento faz parte de um grupo de eventos, busque e selecione o grupo correspondente. Caso contrário, deixe em branco.

### Datas e créditos

- **Data e hora de início e de fim**
- **Formato do crédito**
  - Horas
  - Minutos
- **Créditos**
  - Se deixado em branco, será calculado a partir da data de início e de fim do evento.

### Local e links

- **Lista de locais**
  - Selecione para autopreencher os campos.
  - Ao inserir novas informações ou editar o autopreenchimento, um novo local com os dados editados será criado. Cuidado para não criar locais duplicados!
- **Latitude e longitude**
  - Se definidos, um mapa será exibido na página de detalhes do evento.
- **Nome e descrição exibidos aos usuários**
  - Prefira nomes descritivos, como "Laboratório 6B - Na Central de Laboratórios"
- **Código do YouTube**
  - O código do YouTube é a sequência de letras e números que aparece no final da URL do vídeo. Ex: `https://www.youtube.com/watch?v=abc123` → código: `abc123`
- **Texto e link do botão**
  - Se definidos, um botão será exibido na página de detalhes do evento, com o texto e link configurados.

### Inscrição e presença

- **Permitir inscrição**

  - É possível coletar presença mesmo sem permitir inscrição.
  - Se o evento faz parte de um Major Event e esta opção estiver desmarcada, o evento não aparecerá na página de inscrição do Major Event.

- **Emitir certificado**

   - Para Standalone Event, essa configuração habilita a aparição do evento na aba de emissão de certificados. Se nenhuma outra configuração for selecionada, o certificado será emitido para todos os presentes inscritos.  
   - Se o evento faz parte de um Major Event, essa opção indica se o evento deve aparecer no certificado do Major Event.

- **Emitir certificado para presentes não pagantes?**

  - Essa opção é relevante quando o evento faz parte de um Major Event pago.

- **Emitir certificados para presentes não inscritos?**

- **Coletar presença**

  - Habilite sempre que presenças serão registradas para o evento, mesmo que não seja necessário emitir certificados.

- **Presença on-line**

  - Habilite para permitir que os participantes registrem a própria presença por meio de um código de presença on-line. A leitura por QR Code pode ser utilizada normalmente, mesmo com esta opção habilitada.

- **Disponibilizar lista de inscritos aos ministrantes**

  - Se na página de "informações do organizador" será exibido um botão para download da lista de inscritos do evento em cSV. O arquivo baixado conterá o nome, email e CPF mascarado de cada inscrito.

- **Visível para usuários**

  - Se o evento deve ser exibido para os usuários na lista de eventos do calendário. Desmarcar essa opção é útil para usar a lista de presenças do evento como uma lista de retirada de kits, por exemplo.

- **Inscrever automaticamente pelo grande evento**

  - Se o evento será automaticamente selecionado na página de inscrição de um Major Event.

- **Vagas**

  - Pode ser deixado em branco para vagas ilimitadas

- **Código de presença on-line**

  - Preferencialmente use o botão de dado para gerar um código aleatório.

- **Início e fim da presença on-line**
  - Período em que os participantes poderão registrar a própria presença.

### Ministrantes 

As pessoas cadastradas nessa seção terão acesso à página "informações do organizador" e serão consideradas na emissão automática de certificados para "Palestrantes/ministrantes".

### Coletores de presença com permissões limitadas

As pessoas cadastradas nessa seção poderão coletar presença usando a interface pública, a partir de 3 horas antes do início do evento e até 6 horas depois, mas não terão acesso à interface administrativa do sistema.

Administradores também precisam ser adicionados como coletores de presença para usar a interface pública, caso contrário, só poderão coletar presença usando a interface administrativa.