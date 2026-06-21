import type { StorybookConfig } from '@storybook/angular';

const config: StorybookConfig = {
  stories: ['../src/app/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],
  addons: ['@storybook/addon-a11y', 'msw-storybook-addon'],
  staticDirs: [
    '../public',
    {
      from: '../../../node_modules/@fontsource/material-symbols-outlined/files',
      to: '/material-symbols-outlined-files',
    },
  ],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  webpackFinal: async (webpackConfig) => ({
    ...webpackConfig,
    output: {
      ...webpackConfig.output,
      publicPath: './',
    },
  }),
};

export default config;

// To customize your webpack configuration you can use the webpackFinal field.
// Check https://storybook.js.org/docs/react/builders/webpack#extending-storybooks-webpack-config
// and https://nx.dev/recipes/storybook/custom-builder-configs
