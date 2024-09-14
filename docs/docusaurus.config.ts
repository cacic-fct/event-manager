import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'FCT App Docs',
  tagline: 'Documentação de desenvolvimento e gerenciamento',
  favicon: 'icons/favicon.png',

  // Set the production url of your site here
  url: 'https://docs.fctapp.cacic.dev.br',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'cacic-fct', // Usually your GitHub org/user name.
  projectName: 'fct-app', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  trailingSlash: false,

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'pt-br',
    locales: ['pt-br'],
  },

  scripts: [
    {
      src: 'https://plausible.cacic.dev.br/js/script.js',
      defer: true,
      'data-domain': 'cacic.dev.br',
    },
  ],

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://plausible.cacic.dev.br',
      },
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars/general.ts',
          editUrl: 'https://github.com/cacic-fct/fct-app/tree/main/docs/docs-general/',
          path: 'docs-general',
          routeBasePath: 'Geral',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/cacic-fct/fct-app/tree/main/docs/blog/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'FCT App Docs',
      logo: {
        alt: 'Logo do FCT App Docs',
        src: 'icons/favicon.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'generalSidebar',
          position: 'left',
          label: 'Geral',
        },
        {
          type: 'docSidebar',
          docsPluginId: 'admin',
          sidebarId: 'adminSidebar',
          position: 'left',
          label: 'Administração',
        },
        {
          type: 'docSidebar',
          docsPluginId: 'frontend',
          sidebarId: 'frontendSidebar',
          position: 'left',
          label: 'Frontend',
        },
        {
          type: 'docSidebar',
          docsPluginId: 'backend',
          sidebarId: 'backendSidebar',
          position: 'left',
          label: 'Backend',
        },
        {
          label: 'DevOps',
          href: 'https://cacic.dev.br/docs/Recursos/Servidores/FCTDTIWEBXP01',
          position: 'left',
        },
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          href: 'https://github.com/cacic-fct/fct-app',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'FCT App',
          items: [
            {
              label: 'Aplicativo',
              href: 'https://fctapp.cacic.dev.br',
            },
            {
              label: 'Repositório',
              href: 'https://github.com/cacic-fct/fct-app',
            },
          ],
        },
        {
          title: 'Legal',
          items: [
            {
              label: 'Política de privacidade',
              href: 'https://cacic.dev.br/legal/privacy-policy',
            },
            {
              label: 'Licenças',
              to: '/Geral/Licenças',
            },
          ],
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['javascript', 'typescript', 'bash', 'yaml', 'json'],
    },
    algolia: {
      appId: 'XCRYMK5HFM',
      apiKey: '98cebe9cde6d53017530b7a2ebee9a55',
      indexName: 'fctapp-yudi',
      contextualSearch: true,

      searchPagePath: 'busca',
    },
  } satisfies Preset.ThemeConfig,

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'admin',
        path: 'docs-admin',
        routeBasePath: 'Administração',
        sidebarPath: './sidebars/admin.ts',
        editUrl: 'https://github.com/cacic-fct/fct-app/tree/main/docs/docs-admin/',
        showLastUpdateAuthor: true,
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'frontend',
        path: 'docs-frontend',
        routeBasePath: 'Frontend',
        sidebarPath: './sidebars/frontend.ts',
        editUrl: 'https://github.com/cacic-fct/fct-app/tree/main/docs/docs-frontend/',
        showLastUpdateAuthor: true,
        showLastUpdateTime: true,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'backend',
        path: 'docs-backend',
        routeBasePath: 'Backend',
        sidebarPath: './sidebars/backend.ts',
        editUrl: 'https://github.com/cacic-fct/fct-app/tree/main/docs/docs-backend/',
        showLastUpdateAuthor: true,
        showLastUpdateTime: true,
      },
    ],
  ] as Config['plugins'],
};

export default config;
