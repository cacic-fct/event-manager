import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import icon from 'astro-icon';

import starlightDocSearch from '@astrojs/starlight-docsearch';
import starlightLinksValidator from 'starlight-links-validator';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.fctapp.cacic.dev.br',

  integrations: [
    starlight({
      title: 'FCT App Docs',
      favicon: './favicon.png',

      locales: {
        root: {
          label: 'Português',
          lang: 'pt-BR',
        },
      },
      social: {
        github: 'https://github.com/cacic-fct/fct-app-docs/blob/main',
      },
      editLink: {
        baseUrl: 'https://github.com/cacic-fct/fct-app-docs/edit/main',
      },
      head: [
        {
          tag: 'script',
          attrs: {
            src: 'https://plausible.cacic.dev.br/js/script.js',
            'data-domain': 'docs.fctapp.cacic.dev.br',
            defer: true,
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'description',
            content:
              'O FCT APP Docs possui toda a documentação de desenvolvimento, gerenciamento, uso e manutenção do FCT App, um aplicativo do CACiC para os alunos da FCT-Unesp.',
          },
        },
      ],
      sidebar: [
        {
          label: 'Antes de colaborar',
          collapsed: true,
          autogenerate: {
            directory: 'Antes de colaborar',
          },
        },
        {
          label: 'Documentação',
          collapsed: true,
          autogenerate: {
            directory: 'Documentação',
          },
        },
        {
          label: 'Especificações gerais',
          collapsed: true,
          autogenerate: {
            directory: 'Especificações gerais',
          },
        },
        {
          label: 'Frontend',
          collapsed: true,
          autogenerate: {
            directory: 'Frontend',
          },
        },

        {
          label: 'Backend',
          collapsed: true,
          autogenerate: {
            directory: 'Backend',
          },
        },
        {
          label: 'DevOps',
          collapsed: true,
          autogenerate: {
            directory: 'DevOps',
          },
        },
        {
          label: 'Procedimentos',
          collapsed: true,
          autogenerate: {
            directory: 'Procedimentos',
          },
        },
        {
          label: 'Solução de problemas',
          collapsed: true,
          autogenerate: {
            directory: 'Solução de problemas',
          },
        },
        {
          label: 'Perguntas frequentes',
          collapsed: true,
          link: '/perguntas-frequentes',
        },
        {
          label: 'Práticas sociais',
          collapsed: true,
          autogenerate: {
            directory: 'Práticas sociais',
          },
        },
        {
          label: 'Licenças',
          link: '/licenses',
        },
        {
          label: 'Política de privacidade',
          link: 'https://fctapp.cacic.dev.br/privacy',
        },
      ],
      plugins: [
        starlightDocSearch({
          appId: 'XCRYMK5HFM',
          apiKey: '98cebe9cde6d53017530b7a2ebee9a55',
          indexName: 'fctapp-yudi',
        }),
        starlightLinksValidator(),
      ],
    }),
    tailwind({
      applyBaseStyles: false,
    }),
    icon(),
  ],
});
