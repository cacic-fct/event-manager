# Off-line e service worker

O app público possui suporte off-line para rconsulta de dados e para reduzir falhas durante eventos, especialmente em coleta de presença.

## Banco local

Dados off-line do app público ficam em IndexedDB por meio de Dexie, no banco `cacic-public-offline-data`.

Dados off-line pertencem ao navegador do usuário. Não trate esse armazenamento como fonte de verdade.

## Coleta de presença off-line

Quando uma coleta não consegue confirmar a presença no servidor por falha de rede, o app pode enfileirar a submissão localmente.

## Sincronização

A sincronização deve tentar enviar itens pendentes em lote e aplicar o resultado retornado pelo backend.

Resultados duráveis, como duplicidade, conflito e proibição, não devem ficar em repetição infinita. Falhas temporárias podem ser tentadas novamente.

Quando há pendências, o app pode avisar o usuário pela interface e, se permitido pelo navegador, por notificação do service worker.

## Revisão administrativa

Submissões que o backend não consegue confirmar com segurança entram em revisão no painel administrativo.

Administradores podem aprovar, rejeitar ou inspecionar os detalhes da submissão. Aprovar cria a presença real ou resolve como duplicada quando ela já existe. Rejeitar preserva histórico da submissão.

## Service worker

`ServiceWorkerService` centraliza registro, atualização, ativação e remoção do service worker.

O serviço deve:

- Rodar apenas no navegador (SSR guard);
- Não registrar service worker em desenvolvimento;
- Detectar e aplicar atualizações automaticamente;
- Recarregar a página quando uma atualização exigir novo controle;
- Permitir atualização e remoção manual nas preferências.

## Workbox

O build do app público executa `apps/public/workbox/build-public-workbox.mjs` em produção.

Valide mudanças de cache com:

```bash
bunx nx run public:test-workbox
```

Evite cachear respostas privadas sem chave segura e sem entender o escopo do usuário, para que não haja vazamento de dados entre usuários de um mesmo dispositivo.

## Privacidade

Dados off-line podem conter informações pessoais, presença e identificadores de coleta.

Ao criar novos dados locais:

- Defina quem é o dono do dado;
- Evite armazenar segredos desnecessários;
- Ofereça caminho para limpeza quando o dado for de usuário;
- Cubra exportação, exclusão ou anonimização quando o dado também existir no backend;
- Teste guia anônima quando a funcionalidade depender de IndexedDB persistente.

## Storybook

Estados off-line devem aparecer nas stories quando forem parte importante do fluxo.

Use globals como `network: 'offline'` e `serviceWorker: 'enabled'` quando a story precisar demonstrar comportamento de rede ou service worker.
