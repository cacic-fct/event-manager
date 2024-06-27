---
title: Nginx
---

O arquivo de configuração está disponível em [`cacic-fct/fct-app/docker/nginx/default.conf`](https://github.com/cacic-fct/fct-app/blob/main/docker/nginx/default.conf).

### Configurações

O `server_tokens off;` é usado para evitar que o Nginx envie informações sobre a versão do servidor.

### Headers

Além dos headers do Traefik, também é adicionado o _header_ do `Content-Security-Policy` (CSP) no Nginx.

Esse header é uma camada extra de segurança que ajuda a detectar e mitigar certos tipos de ataques, como _cross-site scripting_ (XSS) e _data injection_.

Em conjunto com o Angular, o `nonce` é usado para permitir a execução de _scripts_ e estilos apenas se eles foram disponibilizados pelo servidor especificamente para aquela requisição.

- `script-src`
  - `'self'` - Permite scripts do próprio site - O Angular exige esta opção insegura ao invés de `'strict-dynamic'`
  - `'nonce-$cspNonce'`
  - `https://www.googletagmanager.com/` - Coleta de dados pelo Google Analytics
  - `https://www.google.com/recaptcha/` - Recaptcha do Google
  - `https://www.gstatic.com/recaptcha/` - Recaptcha do Google
  - `https://accounts.google.com/gsi/` - Google One Tap Login
  - `'wasm-unsafe-eval'` - Permite a execução do leitor de códigos Aztec em WebAssembly. Essa configuração é necessária, pois o suporte do CSP a WebAssembly ainda é limitado.
- `style-src`
  - `'self'`
  - `'nonce-$cspNonce'`
  - `https://accounts.google.com/gsi/style` - Google One Tap Login
- `object-src`
  - `'none'` - Não permite a inserção de objetos
- `base-uri`
  - `'self'`
- `frame-ancestors`
  - `'none'`
- `worker-src`
  - `'self'`
- `frame-src`
  - `https://www.google.com/recaptcha/` - Recaptcha do Google
  - `https://accounts.google.com/` - Login com Google
- `img-src`
  - `'self'`
  - `https://lh3.googleusercontent.com/a/` - Avatar do Google
  - `https://tile.openstreetmap.org/` - Mapas do OpenStreetMap
  - ` https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/` - SVG do Twemoji
- `connect-src`
  - `'self'`
  - `https://identitytoolkit.googleapis.com/` - Login com Google
  - `https://securetoken.googleapis.com/` - Login com Google
  - `https://accounts.google.com/gsi/client` - Google One Tap Login
  - `https://www.google.com/recaptcha/` - Recaptcha do Google
  - `https://www.gstatic.com/recaptcha/` - Recaptcha do Google
  - `https://www.googletagmanager.com/` - Coleta de dados pelo Google Analytics
  - `https://www.google-analytics.com/g/` - Coleta de dados pelo Google Analytics
  - `https://firebase.googleapis.com/` - Firebase
  - `https://firestore.googleapis.com/` - Firebase
  - `https://firebaseremoteconfig.googleapis.com/` - Firebase
  - `https://firebaseinstallations.googleapis.com/` - Firebase
  - `https://content-firebaseappcheck.googleapis.com/` - Firebase
  - `https://cdn.jsdelivr.net/gh/cacic-fct/fct-app@main/src/assets/certificates/templates/` - Templates de certificados
  - `https://cdn.jsdelivr.net/gh/cacic-fct/fonts@main/Inter/latin-ext/` - Fonte Inter para templates de certificados
  - `https://api.highlight.cacic.dev.br` - Monitoramento de erros do Highlight
- `manifest-src`
  - `'self'`
- `default-src`
  - `'none'`

:::danger
O domínio `*.unesp.br` não é confiável.  
CDNs que permitem o upload de arquivos por usuários não são confiáveis.
:::
