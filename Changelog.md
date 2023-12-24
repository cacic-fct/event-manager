### 2023.12.23.22.25

### 2023.12.23.00.19

- Atualização de dependências das Cloud Functions
- Refatorado estrutura de armazenamento dos certificados ([#133](https://github.com/cacic-fct/fct-app/pull/133))
- Removido informação sobre Google Drive ilimitado na página dos calouros

### 2023.12.07.12.07

- Atualização de dependências
- Ano de Copyright não é mais automático

### 2023.09.27.18.08

### 2023.09.27.17.34

### 2023.09.25.01.33

### 2023.09.24.21.22

### 2023.09.19.11.27

### 2023.09.18.23.55

### 2023.09.18.16.21

### 2023.09.18.15.48

### 2023.08.16.22.22

### 2023.05.30.14.45

- Licença de uso alterada para AGPL-3.0-only;
- Adicionado 0.5s de delay na inicialização do mapa na página de informações do evento;
- Usar `getApp()` no `app.module.ts` ao invés de `undefined`.

### 2023.05.21.16.41
- Alterado lógica de importação de services, para reduzir o tamanho inicial do bundle.

### 2023.05.21.01.08

### 2023.05.19.22.22

- Corrigido um bug que fazia com que o Remote Config não funcionasse corretamente;
- Corrigido um bug que fazia com que o mapa da página de eventos fosse exibido quando coordenadas não foram fornecidas;
- Reestruturação da organização das pastas do projeto;
- Removido a cor do toast de atualização; 
- Alterada a string de "nenhum certificado emitido para você";
- Atualização de dependências.

### 2023.03.09.21.05

- Corrigido um bug que fazia com que usuários com a conta deletada não aparecessem corretamente na lista de inscrições de um evento.

### 2023.03.09.20.25

- Removido informacões sobre o upload do cartão de vacinação contra a COVID-19 na página de calouros;
- Atualizado data do mandato da chapa Margaret Hamilton;
- Removido texto do botão de agrupar eventos
- Corrigido um bug que fazia com que usuários indefinidos impedissem a exportação de um CSV;
- Melhorias nos dados exportados em CSV: 
    - Adicionado campo de vínculo com a Unesp;
    - Renomeado o campo "Nome" para "Nome completo".
- Exibir estado de "Usuário externo" nas listas de inscrições ao invés de "RA indefinido";
- Atualização de dependências.

### 2023.01.17.11.53

### 2023.01.16.17.42

### 2023.01.05.11.32

### 2023.01.16.15.35

### 2023.01.15.21.45

- Adicionado 0,5 segundo de delay na inicialização do mapa na página do manual do calouro e na aba do mapa, para evitar o bug que faz com que o mapa não carregue;
- Adicionado botão para recarregar o mapa na página do manual do calouro, para caso o mapa não carregue;
- Desabilitado o botão de "Inscrever-se" na página de detalhes do evento caso o evento já tenha todas as vagas preenchidas;
- Corrigido um bug que exibia o input de carga horária indevidamente na página de criação de evento;
- Corrigido um bug que não impedia a escrita correta do campo `allowSubscription` no banco de dados.

### 2023.01.13.16.57

### 2023.01.13.16.33

### 2023.01.12.18.51

### 2023.01.10.17.51

### 2023.01.05.11.32

### 2023.01.04.15.29

- Adicionado interface para criação de grupos de eventos;
- Corrigido o ordenamento dos eventos não inscritos na página de detalhes da inscrição em um grande evento;
- Corrigido um bug fazia ser exibido "preço único" quando era para exibir-se "Aluno da Unesp" na página de pagamento de um grande evento;

### 2023.01.04.12.10

- Adicionado campo de carga horária na criação do evento;
- Impedir o usuário de avançar um número além dos comprovantes existentes na página de validação;
- Removido adaptações específicas para a SECOMPP22;
- O ícone do aplicativo agora é levemente menor, para evitar ser cortado.

### 2023.01.02.11.55

- Licença de uso alterada para GPL-3.0-only;
- Correção na legenda de clima;
- Adicionado 1 segundo de delay na leitura de QR Codes na página de presenças;
- Mostrar apenas os 5 últimos grandes eventos na aba de "Eventos";
- Remoção da rota do "impersonate", pois o recurso não está implementado corretamente.

### 2022.10.19.16.02

- Página de política de privacidade movida do site do CACiC.

### 2022.10.19.15.46

- Armazenar o usuário que leu o QR Code na página de presenças no banco de dados;
- Botão para remover presença;
- Corrigido `defaultHref` do botão de voltar na página de listar presenças;
- Melhorado a mensagem de alerta do Service Worker.

### 2022.10.18.23.32

- Deixar o texto vermelho quando o número de vagas for menor que 0.

### 2022.10.18.17.54

- Adicionado função de impersonate.

### 2022.10.17.02.22

- Diferenciação de presenças pagas e não pagas;

### 2022.10.16.21.42

- Adicionado caso faltante à lista de códigos de status de pagamento da inscrição.

### 2022.10.16.02.12

- Correção de bug.

### 2022.10.16.01.32

- Correção do bug do `formatPhoneWhatsApp()`

### 2022.10.16.01.07

- Página de validação de inscrições:
    - Palestras agora aparecem em cor azul;
    - Removido o limite do botão de visualização de comprovantes na página de validação de inscrição.

### 2022.10.16.00.49

- Página de validação de inscrições:
     - Removido o limite de query de comprovantes na página de validação de inscrição;
     - Mostrar os ids dos eventos.

### 2022.10.16.00.07

### 2022.10.15.12.25

### 2022.10.13.16.00

### 2022.10.12.18.31

### 2022.10.12.13.17

### 2022.10.12.11.39

### 2022.10.10.21.08.1

### 2022.10.11.13.00

### 2022.10.10.20.53

### 2022.10.10.13.59

### 2022.10.10.13.42

### 2022.10.10.13.29

### 2022.10.10.13.19

### 2022.10.10.19.27

### 2022.10.10.18.25

### 2022.10.10.17.46

### 2022.10.10.17.27

### 2022.10.10.14.20

### 2022.10.10.12.25

### 2022.10.10.12.15

### 2022.10.10.10.45

### 2022.10.10.10.32

### 2022.10.10.09.56.1

### 2022.10.10.09.54

### 2022.10.10.09.46

### 2022.10.10.09.13

### 2022.10.09.11.25

### 2022.10.08.21.21

### 2022.10.08.21.03

### 2022.10.08.20.37

### 2022.10.08.20.18

### 2022.10.08.18.41

### 2022.10.08.18.02.3

### 2022.10.08.17.51

### 2022.10.08.17.18

### 2022.10.08.16.55

### 2022.10.08.16.29

### 2022.10.08.15.21

### 2022.10.08.14.54

### 2022.10.08.14.34

### 2022.10.08.11.25

### 2022.10.08.11.02

### 2022.10.08.10.53

### 2022.10.08.10.39

### 2022.10.07.15.22

### 2022.10.07.14.00

### 2022.10.07.12.47

### 2022.10.07.11.03

### 2022.10.07.10.06

### 2022.08.25.23.06

### 2022.07.26.10.06

### 2022.06.25.16.33

### 2022.05.05.10.52

### 2022.04.27.22.53

### 2022.04.27.22.40

### 2022.04.27.00.26

### 2022.04.26.16.48

### 2022.04.25.22.56

### 2022.04.23.20.54

### 2022.04.23.00.00

### 2022.04.22.14.36

### 2022.04.21.16.22

### 2022.04.20.12.04

### 2022.04.20.01.03

### 2022.04.17.22.29

### 2022.04.16.18.44

### 2022.04.13.22.36

### 2022.04.03.11.22.1

### 2022.03.23.17.39

### 2022.03.22.11.58

### 2022.03.21.21.51

### 2022.03.21.21.43

### 2022.03.20.10.28

### 2022.03.17.18.14

### 2022.03.17.14.22

### 2022.03.14.21.39

### 2022.03.14.16.22.1

### 2022.03.07.18.18

### 2022.03.05.13.57

### 2022.03.04.22.16

### 2022.03.04.21.52