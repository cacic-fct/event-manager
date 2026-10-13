const backend = require('./jest.config.cts');

module.exports = {
  ...backend,
  displayName: 'data-transfer-integration',
  testMatch: ['<rootDir>/src/app/data-transfer/transfer-journal.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: false,
};
