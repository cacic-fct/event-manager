const backend = require('./jest.config.cts');

module.exports = {
  ...backend,
  displayName: 'data-transfer-integration',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  testMatch: ['<rootDir>/src/app/data-transfer/transfer-journal.integration.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: true,
  coverageDirectory: '../../coverage/apps/backend-data-transfer-integration',
};
