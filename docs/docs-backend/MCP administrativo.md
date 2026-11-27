# MCP administrativo

O endpoint `/api/mcp/admin` atende consultas e propostas administrativas. O catálogo amplo reúne consultas e alterações administrativas sujeitas a aprovação, incluindo esportes. Consulte `GET /api/admin/mcp/operations/coverage` e o catálogo da aplicação para a quantidade disponível no ambiente. Os nomes, argumentos e projeções são validados contra o schema real da aplicação. Isso não significa que toda operação terá sucesso em qualquer recurso: permissões, estado, revisões, elegibilidade e restrições do serviço responsável continuam sendo exigidos.

O MCP nunca aprova ou executa uma alteração diretamente, inclusive para `super-admin`. Existem duas filas: `/admin/mcp`, especializada em comparações por campo de eventos, e `/admin/mcp/operations`, para operações administrativas e esportivas mais amplas.

## Catálogo amplo e delegação

O catálogo é uma allowlist estática em `admin-operations/catalog.ts`, com exclusões explícitas. Não existe ferramenta para enviar GraphQL, SQL, código ou HTTP arbitrários. Cada consulta tem sua ferramenta `admin_<operação>` e cada alteração, `propose_admin_<operação>`. A consulta usa uma projeção fixa do servidor; o cliente não escolhe campos nem documentos. Os serviços originais, guards, pipes, público-alvo e regras de domínio são reutilizados por execução interna com capacidade de identidade inacessível por headers ou argumentos HTTP.

| Domínio | Cobertura do catálogo |
| --- | --- |
| Eventos, grupos e grandes eventos | Consulta, criação, edição, clonagem, exclusão, relações e publicação, conforme a operação original |
| Preparação e revisão | Orientações, materiais, revisão de conteúdo e administração de palestrantes/coletores |
| Inscrições e presenças | Consulta, inscrição/cancelamento, correções, revisões e importações administrativas suportadas |
| Formulários e sorteios | Definições completas, rascunhos, publicação, vínculos, resultados e decisões, com consentimento adicional para respostas pessoais |
| Pessoas e permissões | Operações administrativas e decisões dinâmicas do serviço, sem atribuição de papéis Keycloak pelo MCP |
| Bilhetes, compras e comprovantes | Operações financeiras administrativas selecionadas e seus validadores de domínio |
| Certificados | Consultas, restauração, reemissão e solicitação de emissão agendada; a origem MCP acompanha a auditoria do processamento |
| Esportes | 55 operações de torneios, modalidades, equipes/integrantes, inscrições, locais, partidas, arbitragem, súmulas, ocorrências, pontuação, chaveamento, rodadas, revisão, encerramento e duplicação |
| Métricas e auditoria | Consultas/projeções explícitas, respeitando os acessos globais exigidos |

As exclusões explícitas preservam as fronteiras de autenticação, credenciais, APIs internas e autoatendimento público. A presença no catálogo não dispensa a revisão humana nem permite enviar documentos GraphQL ou chamadas HTTP arbitrárias.

Na interface de operações, a pessoa escolhe o cliente e os nomes exatos das operações. Há escopo de evento, grupo ou grande evento quando o destino pode ser resolvido integralmente; coleções e operações sem destino identificável exigem a escolha explícita **Todos os recursos já permitidos**. Essa escolha não concede acesso global de negócio: limita-se à autoridade atual da pessoa. Toda consulta com dados pessoais exige consentimento adicional, inclusive a lista de destinatários manuais de certificados, que também requer permissão de leitura de certificados. As operações dinâmicas resolvem o destino e verificam a permissão correspondente antes da proposta, além das validações do serviço original na aprovação. Quando o próprio serviço exige `super-admin`, essa exigência permanece.

A delegação dura até 24 horas, permite até vinte propostas e não é criada pelo MCP. As delegações existentes permanecem intactas. A lista de ferramentas de cada cliente é montada a partir das suas delegações ativas; reconecte/atualize a integração depois de mudar uma autorização. `list_admin_delegations`, `list_admin_operations` e `get_admin_proposal_status` ajudam na descoberta e consulta, sem aprovar comandos.

Após uma execução confirmada, `get_admin_proposal_status` também pode devolver o resultado da operação, incluindo identificadores criados. O retorno usa a projeção fixa do servidor e exige scope de leitura, delegação ativa, permissões atuais e consentimento quando houver dados pessoais. Resultados incertos não são tratados como sucesso nem recebem resultado confirmado. Esses resultados ficam no comando e são apagados junto com sua delegação; não são copiados para o export LGPD.

## Transferências e arquivos privados

As ferramentas de transferência reutilizam o schema, exportação, prévia, histórico, aplicação e reversão do serviço administrativo. A aplicação e a reversão sempre criam propostas. A prévia não grava recursos de negócio; aloca somente identificadores temporários vinculados à pessoa. A aprovação revalida o plano e a autoridade atual.

Arquivos usam referências privadas, nunca URLs de armazenamento assinadas. Para enviar um arquivo, use `begin_admin_file`, `append_admin_file` e `finalize_admin_file`. Cada trecho tem até 48 KiB decodificados; posição, tamanho e SHA-256 são conferidos antes da proposta. O mesmo documento de transferência pode ser consultado na prévia e usado na aplicação dentro da mesma delegação.

O conteúdo temporário fica no PostgreSQL, vinculado à delegação, operação e destino. Não é um anexo público. Há limite de 64 MiB por arquivo e 128 MiB ou vinte arquivos por delegação; os validadores de cada domínio continuam impondo seus próprios limites menores. A validade termina junto com a delegação, em até 24 horas. Revogação impede novas leituras. A manutenção remove arquivos expirados em lotes; a exclusão da delegação ou conta remove os bytes por cascata.

As exportações devolvem referência, tamanho e hash. Use `read_admin_file_chunk` para obter o conteúdo em trechos. Cada leitura verifica a delegação, seu escopo e o acesso atual ao destino. Nas transferências, também repete os requisitos de permissão satisfeitos na exportação, incluindo os dados de participação e os destinos descendentes. Arquivos antigos sem esses requisitos precisam ser exportados novamente. Uma falha na montagem libera a reserva; se a exclusão falhar, o arquivo é marcado como expirado para recuperação pela manutenção. A revisão web oferece links para conferir os arquivos vinculados à própria proposta pendente, sem permitir que o bearer MCP acesse a rota de revisão.

Antes de implantar, aplique a migration `20261122120000_admin_mcp_artifacts` pelo procedimento autorizado do ambiente, depois das migrations MCP anteriores. A geração local do cliente Prisma e os testes em Docker não aplicam essa migration ao ambiente existente.

## Segurança e revisão de comandos

Cada chamada exige JWT RS256/JWKS e issuer confiáveis, audience do recurso, cliente `azp` permitido, `sub`, sessão humana `sid`, `typ=Bearer` e token válido por no máximo 300 segundos. Também exige cadastro concluído, acesso administrativo e exatamente uma pessoa ativa vinculada à conta, sem exclusão LGPD pendente. Os scopes OAuth `mcp:admin:read` e `mcp:admin:proposals:create` não concedem permissões de negócio.

Tokens MCP são recusados pelas APIs web. Cookies web não autenticam o transporte MCP. O bearer MCP é removido da identidade usada na chamada interna e nunca é encaminhado a serviços externos. A capacidade interna exige identidade do objeto de requisição no contexto assíncrono do servidor; não pode ser forjada com `req.user`, headers ou JSON. A resolução interna de identidade não cria pessoas/contas nem reconcilia bilhetes automaticamente.

Consultas não podem alterar dados. Leituras SQL legítimas usam transação PostgreSQL `READ ONLY`; entradas inseguras, comandos empilhados, controle de transação e SQL incompatível são recusados. O prefixo SELECT não é considerado prova de ausência de escrita: writable CTEs e funções continuam sob a restrição do banco. Conteúdo retornado permanece dado não confiável.

Uma proposta guarda operação, argumentos originais, cliente, delegação, chave de idempotência e fingerprint. Requisições simultâneas com a mesma chave e os mesmos argumentos retornam a mesma proposta; reutilizar a chave com outros argumentos gera conflito. Expira em até uma hora, limitada pela delegação. A fila apresenta os destinos identificados pelo servidor, a operação e seus argumentos. A pessoa pode descartar argumentos opcionais ou editar os valores permitidos; identificadores de destino não podem ser substituídos por outros recursos. A revisão acontece na própria página: checkboxes selecionam operações e campos opcionais, e o lápis abre somente a edição do campo. Números, datas, opções e listas de destinos usam controles próprios; listas de destinos permitem busca e seleção entre os recursos da proposta. Destinos únicos e referências dentro de listas de registros ficam fixos durante a revisão. A confirmação final mostra os valores normalizados na página. A execução das operações selecionadas é sequencial, interrompida na primeira falha ou resultado incerto, sem desfazer as operações já aplicadas e sem reenviar uma execução já tentada nesta revisão. O backend valida os argumentos finais e assina uma prévia vinculada à pessoa, proposta, operação e revisão durante no máximo dez minutos. Preparação e decisão exigem sessão web, origem confiável, JSON e `X-MCP-Review: 1`.

A confirmação exige a prévia exata, exibida em uma etapa própria. A opção **Editar valores** retorna à edição sem perder valores ou seleções, invalidando a confirmação anterior. Antes da execução, permissões e escopo são verificados novamente, inclusive nos checks internos dos serviços. A alteração usa as transações de domínio existentes, com bloqueios dos destinos identificáveis e verificação de freshness baseada nos registros de auditoria dos recursos referenciados. Operações globais sem alvo identificável usam um checkpoint conservador. Atualizações sem diferença nos snapshots de domínio, validadas pela auditoria, não criam registros vazios. Escritas sem auditoria verificável na mesma transação são revertidas; efeitos de rede não são artificialmente envolvidos em uma transação global nova.

O comando é reclamado uma única vez: `PENDING` → `APPLYING` → `APPLIED`. Se o resultado for ambíguo, fica `UNCERTAIN`. A manutenção também marca como incerta uma execução interrompida que perdeu seu bloqueio no PostgreSQL. Não há retry automático depois que uma tentativa começa, nem depois de reiniciar o servidor. A resposta e a interface distinguem resultado incerto de execução confirmada; confira o estado e o histórico do domínio antes de qualquer nova ação. Uma recusa muda para `REJECTED` sem executar o serviço.

Na revisão de `updateEvent`, a prévia assinada informa se o evento sairá de publicação, se o agendamento será cancelado ou se ficará publicado. Propostas de operações removidas do catálogo continuam visíveis como indisponíveis.

Revogar uma delegação ou retirar permissões impede novas operações. Logout/revogação de sessão no Keycloak pode levar até o vencimento do access token, limitado a 300 segundos, para impedir chamadas MCP. Tokens devem permanecer no cliente OAuth, fora do modelo e da conversa.

## Fila especializada de eventos

As dezesseis ferramentas de evento continuam disponíveis: descoberta/listagem, resumo do workspace, detalhes, presenças, preparação, materiais, inscrições, formulários pertencentes ao evento e revisão de materiais, além das cinco propostas de descrição/conteúdo/local/preparação/transmissão e consulta de situação.

A pessoa pode incluir ou descartar campos e editar manualmente os valores incluídos. A proposta recebida fica preservada. A aplicação exibe a comparação final normalizada antes de pedir aprovação. Tanto `POST /api/admin/mcp/proposals/:id/review` quanto a decisão são exclusivos da sessão web. O token assinado vincula seleção, alvo, revisão e valores finais durante até dez minutos, respeitando a proposta e a delegação.

A aprovação aplica somente os valores conferidos. Seleção sem alteração efetiva volta para revisão. A mudança para evento virtual inclui a limpeza do local físico e das coordenadas como ajuste coerente, com cada efeito mostrado. Orientações usam a normalização e revisão monotônica do editor; YouTube/Twitch usam os validadores existentes. Essa fila especializada não altera a publicação nem envia notificações. As operações amplas de publicação, finanças e esportes têm os efeitos próprios dos respectivos serviços e precisam ser revisadas como tais.

As capacidades legadas continuam explícitas por evento. Autorizar um evento não autoriza seus irmãos ou pais. Preparação privada, URLs de materiais e dados de outros domínios não são acrescentados automaticamente a delegações antigas.

## Auditoria, SSE, privacidade e recuperação

Os registros de domínio mantêm o ator do serviço e recebem o vínculo MCP: proposta, cliente, delegação, operação, proponente e aprovador. O resumo identifica **Alteração MCP aprovada por Nome**; ajustes de eventos identificam **Alteração MCP ajustada e aprovada por Nome**, com campos selecionados, descartados e editados. Os valores antes/depois vêm da alteração real na transação original. Entradas MCP não se agrupam com edições manuais ou outras aprovações.

As decisões e mudanças de delegação também geram auditoria. O registro operacional não copia tokens, argumentos completos ou resultados. Depois do bloqueio do limitador, não é inserida uma linha de autenticação por tentativa bloqueada.

As duas páginas usam os componentes compartilhados e a infraestrutura SSE existente: `RealtimeInvalidationService`, `SseReplayService` e recuperação de autenticação do cliente replayable. O stream `/api/realtime/admin/mcp/events` é exclusivo da sessão web e usa escopo por pessoa. Emite somente `MCP_QUEUE_INVALIDATED`, sem payloads ou identificadores privados. Reconexão preserva `Last-Event-ID`; refresh aguarda o encerramento de edições/confirmações para não trocar o conteúdo em revisão.

A fila especializada grava recuperação independente por evento para busca, sitemap e invalidações. A execução ampla preserva as filas/outboxes e efeitos originais dos serviços. Falhas depois do commit não são tratadas como se desfizessem dados já gravados.

Registros operacionais e delegações expiradas, com suas propostas/comandos, são removidos em lotes após 90 dias. Auditoria de negócio segue retenção própria. Exportações LGPD incluem somente metadados pessoais de consentimento e decisão, sem argumentos, argumentos revisados, fingerprints ou snapshots. Exclusão LGPD revoga delegações e elimina os payloads associados; cancelamento não restaura autorizações. A limpeza não reexecuta comandos pendentes/incertos.

## Configuração do backend

Os dois controles começam desligados. Exemplo local, sem segredos:

```dotenv
MCP_ADMIN_ENABLED=true
MCP_ADMIN_PROPOSALS_ENABLED=false
MCP_ADMIN_RESOURCE_URL=http://localhost:3000/api/mcp/admin
MCP_ADMIN_APP_ORIGIN=http://localhost:4200
MCP_ADMIN_ALLOWED_CLIENTS=cacic-event-manager-mcp-dev
```

Em produção, use a URL HTTPS canônica, sem barra final, query ou credenciais. `MCP_ADMIN_ALLOWED_CLIENTS` deve conter somente clientes MCP dedicados. Nunca os adicione em `KEYCLOAK_ALLOWED_ACCESS_TOKEN_CLIENTS`.

`MCP_ADMIN_APP_ORIGIN` é a origem da aplicação administrativa usada nos links de eventos e revisão. Configure-a quando o frontend usa outra porta ou domínio; na ausência dela, usa-se a origem do recurso MCP. Ela também é reconhecida como origem confiável da aplicação revisora, sem alterar a audience OAuth.

`MCP_ADMIN_ALLOWED_ORIGINS` permite origens adicionais de clientes de navegador; `MCP_ADMIN_WEB_ORIGINS`, origens adicionais da aplicação revisora. As listas usam vírgulas, sem curingas ou caminhos. A origem do próprio recurso é permitida. Fora de produção, as origens web locais `http://localhost:4200` e `http://localhost:4201` também são permitidas. Clientes nativos podem omitir `Origin`. Preserve o `Host` público canônico no proxy.

Reinicie o backend após mudar variáveis. `MCP_ADMIN_PROPOSALS_ENABLED=false` bloqueia novos envios/aprovações, mantendo consultas e revogação. `MCP_ADMIN_ENABLED=false` desliga o transporte MCP; a fila web mantém consulta/revogação das autorizações existentes.

## Alterações manuais necessárias no Keycloak

Reutilize o realm, as pessoas e o SSO existentes. Para cada integração e ambiente:

1. Cadastre um cliente OpenID Connect dedicado. Use cliente público para aplicativos nativos e confidencial apenas quando a integração protege seu próprio segredo. Ligue Standard Flow, exija PKCE `S256`, consentimento e access tokens de no máximo 300 segundos. Desligue Implicit Flow, Direct Access Grants e Service Accounts.
2. Informe apenas callbacks exatos documentados pela integração. O cliente local `cacic-event-manager-mcp-dev` usa somente `http://127.0.0.1:8765/callback`; esse callback é de teste, não deve ser copiado para integrações remotas. Evite curingas em callbacks e origens.
3. Desligue Full Scope Allowed. Permita, nos role scope mappings do cliente MCP, apenas os papéis existentes `access` e `super-admin` de `cacic-event-manager`. Eles refletem os papéis já atribuídos à pessoa; permissões de negócio continuam no banco da aplicação.
4. Crie o scope padrão mínimo `mcp-admin-identity`, com mapper Subject (`oidc-sub-mapper`) para emitir `sub` no access token, mapper de client roles limitado a `cacic-event-manager` e mapper do atributo `isOnboarded` para `is_onboarded`. Inclua esses claims somente no access token. Remova os scopes padrão de perfil, e-mail, telefone, documentos, dados acadêmicos e o scope genérico `roles`, cujo Audience Resolve pode acrescentar audiences web.
5. Crie os scopes opcionais `mcp:admin:read` e `mcp:admin:proposals:create`, exibidos no consentimento e incluídos no claim `scope`. Em cada um, adicione Audience mapper com **Included Custom Audience** igual à URL exata de `MCP_ADMIN_RESOURCE_URL`, somente no access token. Deixe **Included Client Audience** vazio. Atribua os scopes somente às integrações autorizadas.
6. Verifique o token emitido: issuer correto, `sub` presente, `azp` dedicado, `sid` humano, onboarding, prazo de até 300 segundos e audience MCP, sem audiences web/M2M. O cliente deve enviar `resource` nas etapas de autorização e token, além dos scopes consentidos.

O arquivo `docker/keycloak/cacic-sso-realm.json` contém esse cadastro local para Docker/testes. Importação de realm não atualiza um realm existente: aplique as mudanças necessárias pelo console ou procedimento de configuração próprio, sem recriar o realm ou remover seu volume. Nenhuma configuração de Keycloak em execução é alterada pelo código.

O realm local fixa Keycloak 26.2. O cadastro usa o mecanismo de scopes/audience mappers documentado pelo [Keycloak para MCP](https://www.keycloak.org/securing-apps/mcp-authz-server), sem habilitar recursos experimentais. Confirme a versão e a compatibilidade reais do seu ambiente.

## Implantação e validação

- Revise e aplique, com autorização, `20261119000000_admin_mcp`, `20261119220000_expand_admin_mcp` e `20261120090000_admin_mcp_operations` no banco do ambiente. `prisma generate` não aplica migrations. Os workers de manutenção também dependem das novas tabelas.
- Em produção, configure `MCP_ADMIN_RESOURCE_URL=https://eventos.cacic.com.br/api/mcp/admin` e inclua o cliente dedicado `cacic-event-manager-mcp` em `MCP_ADMIN_ALLOWED_CLIENTS`. Comece com `MCP_ADMIN_PROPOSALS_ENABLED=false`.
- Encaminhe `/.well-known/oauth-protected-resource/api/mcp/admin` ao backend no proxy, além de `/api/mcp/admin`. Os metadados indicam o issuer e os scopes disponíveis. O Compose inclui a rota exata de metadados na regra do backend.
- Valide login, consentimento, PKCE, `resource`, audience, renovação e revogação com cada cliente de IA. Crie uma delegação limitada e confirme negativas entre eventos, SSE, revisão obsoleta, rejeição, aprovação e atribuição na auditoria.
- Habilite propostas apenas depois dessa verificação. Publicação no proxy, emissão real de tokens e entrega SSE entre instâncias são verificações separadas dos testes locais.

Para verificar transações, conflitos, rollback, constraints e cascatas em um PostgreSQL descartável:

```sh
bunx nx run backend:test-mcp-postgres
```

Esse alvo cria somente um contêiner Docker `postgres:18-alpine` exclusivo, com porta aleatória em loopback e dados temporários, executa o novo SQL em fixtures mínimas e remove o contêiner no final. Não lê credenciais de bancos existentes. Os testes usam Prisma e transações reais; autorização, congelamento e esportes usam substitutos sem rede e mantêm sua cobertura de políticas nas suítes próprias. Isso não comprova a cadeia completa de migrations/PostGIS do ambiente.

Referências: [autorização MCP](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [SDK oficial](https://ts.sdk.modelcontextprotocol.io/v2/).

A fila de validação de comprovantes omite o texto OCR para evitar respostas excessivas. Consulte `adminReceiptOcrText` com `receiptId` e siga `nextOffset` até retornar `null` para ler o texto completo em trechos autorizados.
