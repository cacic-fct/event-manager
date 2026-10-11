import type { StorybookConfig } from '@storybook/angular';
import { getLibraryStoryGlobs } from '../../../tools/storybook-library-stories.mjs';

const config: StorybookConfig = {
  stories: [
    '../src/app/**/*.@(mdx|stories.@(js|jsx|ts|tsx))',
    ...getLibraryStoryGlobs('public'),
  ],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', 'msw-storybook-addon'],
  staticDirs: [
    '../public',
    { from: '../public', to: '/app' },
    {
      from: '../../../node_modules/@fontsource/material-symbols-outlined/files',
      to: '/material-symbols-outlined-files',
    },
  ],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
};

export default config;

// To customize your webpack configuration you can use the webpackFinal field.
// Check https://storybook.js.org/docs/react/builders/webpack#extending-storybooks-webpack-config
// and https://nx.dev/recipes/storybook/custom-builder-configs
