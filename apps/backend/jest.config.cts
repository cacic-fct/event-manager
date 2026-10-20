module.exports = {
  displayName: 'backend',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    // Compile lazy imports to CommonJS so unit-test mocks work without Node's experimental VM modules.
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.unit.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!@cacic-fct/form-contracts/)'],
  // PGlite loads WebAssembly through ESM; its isolated integration target enables Node's VM modules.
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
