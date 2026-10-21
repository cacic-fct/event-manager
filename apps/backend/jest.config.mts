export default {
  displayName: 'backend',
  preset: '../../jest.preset.mjs',
  testEnvironment: 'node',
  maxWorkers: 2,
  workerIdleMemoryLimit: '512MB',
  // Keep the PGlite and PostgreSQL suites in their dedicated integration targets.
  testPathIgnorePatterns: [
    '/node_modules/',
    'data-transfer/.*\\.integration\\.spec\\.ts$',
    'transfer-http\\.e2e\\.spec\\.ts$',
    'data-transfer\\.postgres\\.spec\\.ts$',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/backend',
  coverageReporters: ['lcov', 'json', 'text', 'clover'],
};
