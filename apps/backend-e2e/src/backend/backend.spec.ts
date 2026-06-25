import axios from 'axios';

describe('GET /api', () => {
  it('redirects to the API documentation', async () => {
    const res = await axios.get('/api', {
      maxRedirects: 0,
      validateStatus: () => true,
    });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('https://docs.fctapp.cacic.dev.br/Backend/API');
  });
});
