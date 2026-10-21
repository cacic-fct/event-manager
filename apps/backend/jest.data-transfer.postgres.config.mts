import backend from './jest.config.mts';

export default {
  ...backend,
  displayName: 'data-transfer-postgres',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['<rootDir>/src/app/data-transfer/data-transfer.postgres.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30_000,
  collectCoverage: false,
  coverageDirectory: '../../coverage/apps/backend-data-transfer-postgres',
};
