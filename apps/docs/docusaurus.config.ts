import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'SecretLobby Documentation',
  tagline: 'Complete documentation for SecretLobby platform',
  favicon: 'https://cdn.secretlobby.co/prod/system/favicons/favicon.ico',

  future: {
    v4: true,
  },

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: 'https://cdn.secretlobby.co/prod/system/favicons/favicon-16x16.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: 'https://cdn.secretlobby.co/prod/system/favicons/favicon-32x32.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        href: 'https://cdn.secretlobby.co/prod/system/favicons/apple-touch-icon.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'manifest',
        href: 'https://cdn.secretlobby.co/prod/system/favicons/site.webmanifest',
      },
    },
  ],

  url: 'https://docs.secretlobby.co',
  baseUrl: '/',

  organizationName: 'dnpg',
  projectName: 'secretlobby',

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'SecretLobby Docs',
      logo: {
        alt: 'SecretLobby Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'appsSidebar',
          position: 'left',
          label: 'Apps',
        },
        {
          type: 'docSidebar',
          sidebarId: 'packagesSidebar',
          position: 'left',
          label: 'Packages',
        },
        {
          type: 'docSidebar',
          sidebarId: 'guidesSidebar',
          position: 'left',
          label: 'Guides',
        },
        {
          href: 'https://github.com/dnpg/secretlobby',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Applications',
          items: [
            { label: 'Marketing', to: '/apps/marketing' },
            { label: 'Console', to: '/apps/console' },
            { label: 'Lobby', to: '/apps/lobby' },
            { label: 'Super Admin', to: '/apps/super-admin' },
          ],
        },
        {
          title: 'Packages',
          items: [
            { label: 'UI Components', to: '/packages/ui' },
            { label: 'Authentication', to: '/packages/auth' },
            { label: 'Database', to: '/packages/db' },
            { label: 'Payments', to: '/packages/payments' },
          ],
        },
        {
          title: 'More Packages',
          items: [
            { label: 'Email', to: '/packages/email' },
            { label: 'Logger', to: '/packages/logger' },
            { label: 'Storage', to: '/packages/storage' },
          ],
        },
        {
          title: 'Links',
          items: [
            { label: 'SecretLobby', href: 'https://secretlobby.co' },
            { label: 'Console', href: 'https://console.secretlobby.co' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} SecretLobby. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'json', 'sql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
