const { getJestConfig } = require('@storybook/test-runner');
const { resolve } = require('node:path');

const config = getJestConfig();

module.exports = {
  ...config,
  modulePathIgnorePatterns: [...(config.modulePathIgnorePatterns ?? []), '<rootDir>/dist/', '<rootDir>/.nx/'],
  setupFilesAfterEnv: [...config.setupFilesAfterEnv, resolve(__dirname, 'test-runner-setup.ts')],
};
