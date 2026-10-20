const backend = require('./jest.config.cts');

module.exports = {
  ...backend,
  displayName: 'data-transfer-postgres',
  testMatch: ['<rootDir>/src/app/data-transfer/data-transfer.postgres.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30_000,
  collectCoverage: false,
  coverageDirectory: '../../coverage/apps/backend-data-transfer-postgres',
};
