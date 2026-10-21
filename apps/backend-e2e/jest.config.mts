export default {
  displayName: 'backend-e2e',
  preset: '../../jest.preset.mjs',
  setupFilesAfterEnv: ['<rootDir>/src/support/test-setup.ts'],
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/backend-e2e',
  coverageReporters: ['lcov', 'json', 'text', 'clover'],
  testTimeout: 30_000,
  collectCoverageFrom: [
    '../backend/src/**/*.ts',
    '!../backend/src/**/*.spec.ts',
    '!../backend/src/**/*.test.ts',
    '!../backend/src/**/*.stories.ts',
    '!../backend/src/main.ts',
  ],
};
