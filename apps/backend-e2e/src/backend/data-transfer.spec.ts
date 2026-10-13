import axios from 'axios';

// These tests exercise the production HTTP parser, routing and guards. Database
// rollback is covered separately by the isolated PostgreSQL integration suite.
jest.mock('../../../backend/src/app/prisma/prisma.service', () => ({
  PrismaService: class {
    auditLogEntry = { findMany: jest.fn().mockResolvedValue([]) };
  },
}));
jest.mock('../../../backend/src/app/certificate/certificate-template-registry.service', () => ({
  CertificateTemplateRegistryService: class {},
}));

describe('JSON data transfer HTTP safety', () => {
  it.each([
    ['get', 'schema'],
    ['get', 'history'],
    ['post', 'export'],
    ['post', 'preview'],
    ['post', 'apply'],
    ['post', 'undo'],
  ] as const)('rejects unauthenticated %s %s requests', async (method, endpoint) => {
    const response = await axios.request({
      method,
      url: `/api/admin/data-transfer/${endpoint}`,
      data: method === 'post' ? { document: {}, batchId: 'another-organizer-batch' } : undefined,
      validateStatus: () => true,
    });

    expect([401, 403]).toContain(response.status);
  });

  it('lets a transfer payload above the ordinary JSON limit reach the authentication gate', async () => {
    const response = await axios.post(
      '/api/admin/data-transfer/preview',
      { document: { padding: 'x'.repeat(150 * 1024) } },
      { validateStatus: () => true },
    );

    expect([401, 403]).toContain(response.status);
  });

  it.each(['/api/auth/password-login', '/api/admin/data-transfer-unrelated/preview'])(
    'keeps the ordinary request limit for %s',
    async (url) => {
      const response = await axios.post(url, { padding: 'x'.repeat(150 * 1024) }, { validateStatus: () => true });

      expect(response.status).toBe(413);
    },
  );

  it('rejects oversized transfer bodies before planning or writing', async () => {
    const response = await axios.post(
      '/api/admin/data-transfer/apply',
      { document: { padding: 'x'.repeat(6 * 1024 * 1024) } },
      { validateStatus: () => true },
    );

    expect(response.status).toBe(413);
  });

  it('rejects malformed transfer JSON before calling the destructive handler', async () => {
    const response = await axios.post('/api/admin/data-transfer/apply', '{"document":', {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });

    expect(response.status).toBe(400);
  });
});
