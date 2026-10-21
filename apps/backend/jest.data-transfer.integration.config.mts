import backend from './jest.config.mts';

export default {
  ...backend,
  displayName: 'data-transfer-integration',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: [
    '<rootDir>/src/app/data-transfer/*.integration.spec.ts',
    '<rootDir>/src/app/data-transfer/transfer-http.e2e.spec.ts',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: true,
  coverageDirectory: '../../coverage/apps/backend-data-transfer-integration',
};
