import axios from 'axios';

describe('tracking cookie boundaries', () => {
  it('lets logout flows clear CACiC tracking cookies without credentials', async () => {
    const response = await axios.post(
      '/api/tracking/clear',
      {},
      {
        validateStatus: () => true,
      },
    );

    expect([200, 201]).toContain(response.status);
    expect(response.data).toEqual({ cleared: true });
    expect(response.headers['set-cookie']?.join('\n')).toContain('cacic-analytics-id=;');
    expect(response.headers['set-cookie']?.join('\n')).toContain('cacic-analytics-consent=;');
  });
});
