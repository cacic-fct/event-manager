# Proteção contra abuso

## Rate limits

Os limites são aplicados por política, não por um throttle global único. Isso permite tratar confirmação de presença, inscrições, upload de comprovantes, validação de certificados, download público e consultas públicas com janelas diferentes.

Respostas de limite devem preservar informação suficiente para a interface mostrar espera ou tentativa futura, mas não devem revelar detalhes que facilitem enumeração.

As políticas ficam em `apps/backend/src/app/rate-limit/rate-limit.policies.ts`.

O guard avalia o rate limit por tipo de operação e usa Redis como estado compartilhado. Fora de produção, não há limites, mas o backend ainda registra quando uma política teria bloqueado a requisição.

## Resposta para a interface

Erros de rate limit devem carregar `retryAfterSeconds` para que o frontend consiga mostrar tempo de espera.

O frontend público possui helpers para ler esse formato em GraphQL e REST. Não troque o formato sem atualizar esses helpers e os testes.

## Cloudflare Turnstile

O Turnstile é usado como proteção complementar para fluxos públicos de maior risco. Ele não substitui autenticação, autorização, validação de domínio nem rate limit.

## Fluxos protegidos

Use proteção contra abuso em fluxos públicos que podem gerar custo, enumeração ou ruído operacional, como:

- Validação e download de certificados;
- Confirmação de presença;
- Inscrição pública;
- Upload de comprovante;
- Consultas públicas de alta frequência.

Turnstile não substitui rate limit. Rate limit não substitui validação de domínio. Nenhum dos dois substitui autorização.

## Privacidade

Mensagens de falha não devem informar se um certificado, usuário, inscrição, comprovante ou evento existe.

Ao registrar falhas, prefira identificadores técnicos e evite armazenar respostas de formulários, documentos ou comprovantes em logs.
