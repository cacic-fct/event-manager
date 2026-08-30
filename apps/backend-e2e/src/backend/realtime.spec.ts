import axios from 'axios';

describe('realtime SSE HTTP boundaries', () => {
  it('exposes the public catalog stream without credentials and keeps it as SSE', async () => {
    const response = await axios.get('/api/realtime/public/catalog/events', {
      responseType: 'stream',
      timeout: 5_000,
      validateStatus: () => true,
    });

    try {
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      expect(response.headers['cache-control']).toContain('no-cache');
    } finally {
      response.data.destroy();
    }
  });

  it('rejects the administrative workspace stream without credentials', async () => {
    const response = await axios.get('/api/realtime/admin/workspace/events', {
      validateStatus: () => true,
    });

    expect([401, 403]).toContain(response.status);
  });
});
