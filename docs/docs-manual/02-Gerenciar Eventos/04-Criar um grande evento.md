# Criar um grande evento

Crie o grande evento _antes_ de criar os eventos que o compõem.  
Na criação do evento, você precisará indicar um grande evento já existente.


## Campos do formulário

### Identidade

- **Emoji**
  - É o ícone do evento. Insira somente 1 (um) emoji, sem texto.

- **Início e fim do grande evento**
  - O início do grande evento é a data e hora de início do primeiro evento que o compõe.
  - O fim do grande evento é a data e hora de fim do último evento que o compõe.

- **Texto e link do botão**
  - Se definidos, um botão será exibido na aba de grandes eventos, com o texto e o link configurados.

- **Descrição**
  - A descrição é exibida na aba de grandes eventos.

### Inscrições

- **Início e fim das inscrições**
  - As inscrições podem terminar enquanto o grande evento ainda está acontecendo.

- **Máximo de minicursos, palestras ou outros eventos por pessoa**
  - Os eventos com inscrição automática/obrigatória são contabilizados para o limite.

- **Inscrição por voto preferencial**
  - Os participantes podem indicar de quais eventos do grande evento desejam participar, por ordem de preferência. O sistema tentará alocar os participantes nos eventos de acordo com suas preferências, respeitando os limites de vagas de cada evento.
  - Se essa opção estiver desabilitada, os participantes poderão inscrever-se livremente em eventos que tenham vagas, sem necessidade de indicar preferência, no modo tradicional.

### Contato e pagamento

- **Exigir pagamento**
- **Emitir certificados para presentes não pagantes?**
- **Emitir certificados para presentes não inscritos?**
- **Tipo e informações de contato**
  - Se definido, um link de contato será exibido na aba de grandes eventos, com o tipo e as informações configurados.
- **Informações adicionais de pagamento**
  - Texto visível na página de pagamento. Exemplo: "Inclua seu nome no comprovante de pagamento do Pix. Evite pagar em dinheiro, mas, se for necessário, entre em contato com o CACiC"
- **Banco, agência, conta, titular e documento**
  - Dados mínimos para realização de TED ou Pix sem chave
- **Chave Pix**
  - Será disponibilizada na página de pagamento;
  - Necessária para a geração de BR Code.
- **Cidade do Pix**
  - Campo opcional para geração de BR Code.

### Preços

- **Preço único**
- **Preços por tipos**
 - Se definido, os participantes deverão escolher um tipo ao se inscrever, e o preço do grande evento será o preço definido para o tipo escolhido.

### Regras de inscrição por faixa de preço

Em **Configuração do grande evento → Preços**, cada faixa oferece duas opções independentes, desativadas por padrão:

- **Limitar as atividades disponíveis para este preço:** permite escolher os eventos e grupos disponíveis para quem selecionar essa faixa. Salve o grande evento e cadastre sua programação antes de configurar essa opção. Os grupos são liberados como uma unidade, com todos os eventos que os compõem. Nenhuma atividade selecionada significa que a faixa não oferece atividades para inscrição.
- **Personalizar limites de inscrição desta faixa:** substitui os limites gerais de minicursos, palestras e outras atividades. Deixe um campo em branco para permitir inscrições sem limite nessa categoria; use **0** para impedir inscrições nessa categoria. Os limites podem ser maiores ou menores que os limites gerais.

Com as opções desativadas, a faixa mantém as atividades e os limites gerais do grande evento. A seleção e os limites salvos ficam guardados para uma eventual reativação. Faixas que não incluem inscrição em eventos não oferecem essas atividades, mesmo que tenham regras salvas.

As regras valem para a inscrição tradicional, a inscrição por preferência e as inscrições feitas pelo painel administrativo. Atividades automáticas permitidas também contam para o limite; configure um limite que comporte todas as atividades obrigatórias disponíveis na faixa.

Ao importar inscrições por CSV, escolha a faixa de preço aplicável ao arquivo quando houver regras por faixa. Quando nenhuma faixa é informada, a importação preserva a faixa das inscrições existentes. Novas inscrições precisam de uma faixa válida se houver regras por faixa.

Salvar novas regras não cancela automaticamente inscrições existentes. Ao alterar a faixa ou a seleção de atividades de uma inscrição, o sistema verifica as regras atuais. Ao copiar um grande evento com regras de atividades, a nova faixa mantém a restrição com a seleção vazia: escolha a programação do novo grande evento antes de abrir as inscrições.
