import nxJest from '@nx/jest/preset';

export default {
  ...nxJest.nxPreset,
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', useESM: true }],
  },
  // Let Jest select package exports for each ESM import or CommonJS dependency.
  testEnvironmentOptions: {},
};
