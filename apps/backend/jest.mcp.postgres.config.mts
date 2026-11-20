import backend from './jest.config.mts';

if (process.env['MCP_POSTGRES_ISOLATED_CLUSTER'] !== '1' || !process.env['MCP_POSTGRES_TEST_DATABASE_URL']) {
  throw new Error('Run backend:test-mcp-postgres to create a new isolated temporary PostgreSQL cluster.');
}

export default {
  ...backend,
  displayName: 'mcp-postgres',
  testMatch: ['<rootDir>/src/app/mcp/mcp-admin.postgres.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: false,
  testTimeout: 20_000,
};
