import axios from 'axios';

const describeKeycloak = process.env.KEYCLOAK_BACKED_E2E === 'true' ? describe : describe.skip;
const keycloakRealmUrl = process.env.KEYCLOAK_REALM_URL ?? 'http://localhost:18080/realms/cacic-sso';
const backendHost = process.env.HOST ?? 'localhost';
const backendPort = process.env.PORT ?? '3000';

describeKeycloak('Keycloak-backed authentication', () => {
  beforeAll(async () => {
    await waitForKeycloak();
  });

  it('redirects OAuth login to the imported test realm without a development IdP hint', async () => {
    const response = await axios.get('/api/auth/login/redirect', {
      maxRedirects: 0,
      params: {
        returnTo: '/admin/',
        prompt: 'none',
      },
      validateStatus: () => true,
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.location);
    expect(location.origin + location.pathname).toBe(
      `${new URL(keycloakRealmUrl).origin}/realms/cacic-sso/protocol/openid-connect/auth`,
    );
    expect(location.searchParams.get('client_id')).toBe('cacic-event-manager');
    expect(location.searchParams.get('redirect_uri')).toBe(`http://${backendHost}:${backendPort}/api/auth/callback`);
    expect(location.searchParams.get('prompt')).toBe('none');
    expect(location.searchParams.get('scope')).toContain('identity-document');
    expect(location.searchParams.get('scope')).toContain('academic-profile');
    expect(location.searchParams.has('kc_idp_hint')).toBe(false);
  });

  it('creates an Event Manager session from an imported Keycloak password user', async () => {
    const loginResponse = await axios.post(
      '/api/auth/password-login',
      {
        email: 'ALUNO@UNESP.BR',
        password: '1',
      },
      {
        validateStatus: () => true,
      },
    );

    expect(loginResponse.status).toBe(201);
    expect(loginResponse.data.user).toEqual(
      expect.objectContaining({
        email: 'aluno@unesp.br',
        roles: expect.arrayContaining(['access']),
        claims: expect.objectContaining({
          identity_document: '22222222222',
          enrollment_number: '222222',
        }),
      }),
    );
    const sessionCookie = readSessionCookie(loginResponse.headers['set-cookie']);
    expect(sessionCookie).toContain('cacic_eventos_session=');

    const meResponse = await axios.get('/api/auth/me', {
      headers: {
        Cookie: sessionCookie,
      },
      validateStatus: () => true,
    });

    expect(meResponse.status).toBe(200);
    expect(meResponse.data).toEqual(
      expect.objectContaining({
        email: 'aluno@unesp.br',
        roles: expect.arrayContaining(['access']),
      }),
    );
  });

  it('accepts imported Account Manager service-account tokens for Event Manager M2M roles only', async () => {
    const allowedToken = await requestClientCredentialsToken(
      'cacic-account-manager-m2m',
      'cacic-account-manager-m2m-dev-secret',
    );
    const allowedPayload = decodeJwtPayload(allowedToken);
    expect(asArray(allowedPayload['aud'])).toContain('cacic-event-manager-audience');
    expect(
      (((allowedPayload['resource_access'] as Record<string, unknown>)['cacic-event-manager-audience'] as {
        roles?: string[];
      })?.roles ?? []),
    ).toEqual(expect.arrayContaining(['account-profile:write']));

    const acceptedAuthResponse = await axios.post(
      '/api/internal/account-profile/updated',
      {},
      {
        headers: {
          Authorization: `Bearer ${allowedToken}`,
        },
        validateStatus: () => true,
      },
    );
    expect(acceptedAuthResponse.status).toBe(400);

    const wrongAudienceToken = await requestClientCredentialsToken(
      'cacic-event-manager-m2m',
      'cacic-event-manager-m2m-dev-secret',
    );
    const rejectedAuthResponse = await axios.post(
      '/api/internal/account-profile/updated',
      {},
      {
        headers: {
          Authorization: `Bearer ${wrongAudienceToken}`,
        },
        validateStatus: () => true,
      },
    );
    expect(rejectedAuthResponse.status).toBe(403);
  });
});

async function waitForKeycloak(): Promise<void> {
  const metadataUrl = `${keycloakRealmUrl}/.well-known/openid-configuration`;
  const timeoutAt = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(metadataUrl);
      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Test Keycloak is not ready at ${metadataUrl}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function requestClientCredentialsToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await axios.post(`${keycloakRealmUrl}/protocol/openid-connect/token`, body.toString(), {
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  const accessToken = response.data?.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error(`Keycloak did not return an access token for ${clientId}.`);
  }

  return accessToken;
}

function readSessionCookie(setCookie: string[] | string | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const sessionCookie = cookies.find((cookie) => cookie.startsWith('cacic_eventos_session='));
  if (!sessionCookie) {
    throw new Error('Expected password login to set the Event Manager session cookie.');
  }

  return sessionCookie.split(';')[0];
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('Expected a JWT with a payload segment.');
  }

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}
