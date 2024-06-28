import type { UserConfig } from '@commitlint/types';

const Configuration: UserConfig = {
  extends: ['@commitlint/config-angular'],
  formatter: '@commitlint/format',
  rules: {
    'scope-enum': [2, 'always', ['docs', 'frontend', 'backend']],
  },
};

export default Configuration;
