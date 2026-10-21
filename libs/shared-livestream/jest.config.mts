import type { Config } from 'jest';

export default {
  displayName: 'shared-livestream',
  preset: '../../jest.preset.mjs',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/shared-livestream',
  coverageReporters: ['lcov', 'json', 'text', 'clover'],
} satisfies Config;
