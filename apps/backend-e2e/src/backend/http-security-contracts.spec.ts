import axios from 'axios';

describe('HTTP security contracts', () => {
  it.each([
    ['current-user privacy', 'get', '/api/privacy/settings'],
    ['LGPD export', 'post', '/api/lgpd/user-data'],
    ['account merge scoring', 'post', '/api/account-merge/score'],
    ['event form export', 'get', '/api/event-forms/form-1/results.csv'],
  ] as const)('protects the %s boundary without credentials', async (_label, method, url) => {
    const response = await axios.request({
      method,
      url,
      data: method === 'post' ? {} : undefined,
      validateStatus: () => true,
    });

    expect([401, 403]).toContain(response.status);
  });

  it('allows credentialed CORS preflight from the public application origin', async () => {
    const response = await axios.options('/api/auth/me', {
      headers: {
        Origin: 'https://eventos.cacic.com.br',
        'Access-Control-Request-Method': 'GET',
      },
      validateStatus: () => true,
    });

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://eventos.cacic.com.br');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS access to an untrusted origin', async () => {
    const response = await axios.options('/api/auth/me', {
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'GET',
      },
      validateStatus: () => true,
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps unknown API routes closed with a 404 response', async () => {
    const response = await axios.get('/api/not-a-real-route', {
      validateStatus: () => true,
    });

    expect(response.status).toBe(404);
  });
});

describe('public sports overlay contract', () => {
  it('serves the database-independent demo through the production HTTP route', async () => {
    const response = await axios.get('/api/sports/public/matches/demo/overlay', {
      params: {
        periodWord: 'Turno',
        team: 'both',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.data).toContain('data-match-id="demo"');
    expect(response.data).toContain('/api/sports/public/matches/demo/overlay/data');
    expect(response.data).toContain('/api/sports/matches/demo/events');
    expect(response.data).toContain('Turno 1');
  });

  it('exposes only the minimal demo projection as JSON', async () => {
    const response = await axios.get('/api/sports/public/matches/demo/overlay/data');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.data).toEqual(
      expect.objectContaining({
        id: 'demo',
        homeTeam: expect.objectContaining({ name: 'Equipe A' }),
        awayTeam: expect.objectContaining({ name: 'Equipe B com nome longo' }),
        scoreboard: expect.objectContaining({ homeScore: 1, awayScore: 99 }),
      }),
    );
    expect(response.data).not.toHaveProperty('rosters');
    expect(response.data).not.toHaveProperty('officials');
  });
});
