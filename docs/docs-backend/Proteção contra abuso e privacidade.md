# Proteção contra abuso

## Rate limits

Os limites são aplicados por política, não por um throttle global único. Isso permite tratar confirmação de presença, inscrições, upload de comprovantes, validação de certificados, download público e consultas públicas com janelas diferentes.

Respostas de limite devem preservar informação suficiente para a interface mostrar espera ou tentativa futura, mas não devem revelar detalhes que facilitem enumeração.

## Cloudflare Turnstile

O Turnstile é usado como proteção complementar para fluxos públicos de maior risco. Ele não substitui autenticação, autorização, validação de domínio nem rate limit.