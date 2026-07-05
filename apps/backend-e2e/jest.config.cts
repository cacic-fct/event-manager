module.exports = {
  displayName: 'backend-e2e',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/support/test-setup.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
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
