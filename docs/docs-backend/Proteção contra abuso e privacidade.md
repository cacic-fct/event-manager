# Proteção contra abuso e privacidade

As proteções contra abuso ficam no backend. A interface pode mostrar mensagens, contadores e componentes auxiliares, mas não deve ser a barreira de segurança principal.

## Rate limits

Os limites são aplicados por política, não por um throttle global único. Isso permite tratar confirmação de presença, inscrições, upload de comprovantes, validação de certificados, download público e consultas públicas com janelas diferentes.

Quando adicionar uma política, escolha uma chave de recurso que represente o alvo real do abuso. Por exemplo, uma ação sobre um evento deve considerar o evento, não apenas o IP ou o usuário.

Respostas de limite devem preservar informação suficiente para a interface mostrar espera ou tentativa futura, mas não devem revelar detalhes que facilitem enumeração.

## Turnstile

Turnstile é usado como proteção complementar para fluxos públicos de maior risco. Ele não substitui autenticação, autorização, validação de domínio nem rate limit.

Em produção, a ausência de chave secreta é erro de configuração. Em desenvolvimento, o serviço pode usar a chave de teste quando a verificação não está explicitamente habilitada.

Valide sempre a action esperada e, quando configurado, o hostname. Aceitar um token válido para outra action enfraquece a separação entre fluxos.

## Privacidade e tracking

Chamadas de navegador para preferências de privacidade de outro domínio não devem ser tratadas como sessão compartilhada. A fronteira segura é o backend de mesma origem: o frontend chama `/api`, e o backend consulta o Account Manager por M2M quando necessário.

Cookies de analytics são atualizados de forma best-effort a partir da sessão local e das preferências do Account Manager. Falhas nessa sincronização não devem derrubar login, logout ou navegação.

Ao limpar tracking no logout, remova cookies compartilhados e host-only. Isso evita que uma configuração antiga sobreviva por ter sido gravada com outro escopo de domínio.
