import axios from 'axios';

describe('authentication boundaries', () => {
  it('keeps the API documentation redirect public', async () => {
    const response = await axios.get('/api', {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe('https://docs.fctapp.cacic.dev.br/Backend/API');
  });

  it('rejects the current-user endpoint when no credentials are provided', async () => {
    const response = await axios.get('/api/auth/me', {
      validateStatus: () => true,
    });

    expect([401, 403]).toContain(response.status);
  });

  it('rejects token refresh before calling Keycloak when the session cookie is missing', async () => {
    const response = await axios.post(
      '/api/auth/refresh',
      {},
      {
        validateStatus: () => true,
      },
    );

    expect(response.status).toBe(403);
    expect(response.data).toEqual(
      expect.objectContaining({
        message: 'Missing session.',
      }),
    );
  });

  it('rejects permission evaluation when no authenticated principal is attached', async () => {
    const response = await axios.post(
      '/api/auth/permissions/evaluate',
      {
        permissions: ['event#read'],
      },
      {
        validateStatus: () => true,
      },
    );

    expect([401, 403]).toContain(response.status);
  });
});
