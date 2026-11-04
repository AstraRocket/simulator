import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../web/package.json', import.meta.url), 'utf-8'));

// `docusaurus start` with no --locale sets DOCUSAURUS_CURRENT_LOCALE to the string "undefined".
const FOOTER: Record<string, string> = {
  en:
    `Documentation for AstraRocket v${version}. ` +
    'AstraRocket runs OpenRocket’s own engine. Not affiliated with the OpenRocket project. ' +
    'See the <a href="https://openrocket.readthedocs.io">OpenRocket documentation</a> for the underlying physics.',
  // cspell:disable
  es:
    `Documentación de AstraRocket v${version}. ` +
    'AstraRocket ejecuta el propio motor de OpenRocket. No está afiliado al proyecto OpenRocket. ' +
    'Consulta la <a href="https://openrocket.readthedocs.io">documentación de OpenRocket</a> para la física subyacente.',
  // cspell:enable
};
const footerCopyright = (): string => {
  const current = process.env.DOCUSAURUS_CURRENT_LOCALE;
  const locale = !current || current === 'undefined' ? 'en' : current;
  const line = FOOTER[locale];
  if (!line) throw new Error(`docusaurus.config.ts has no footer line for the ${locale} locale`);
  return line;
};

const pinFile = (path: string) => {
  const fields = new Map(
    readFileSync(new URL(path, import.meta.url), 'utf-8')
      .split('\n')
      .map((line) => /^(\w+)\s*=\s*(\S+)/.exec(line))
      .filter((m) => m !== null)
      .map((m) => [m[1]!, m[2]!] as const),
  );
  return (key: string): string => {
    const value = fields.get(key);
    if (!value) throw new Error(`${path} has no \`${key}\` line`);
    return value;
  };
};

const upstreamField = pinFile('../engine-java/extract/UPSTREAM');
const upstreamRef = upstreamField('ref');
const upstream = {
  ref: upstreamRef,
  shortRef: upstreamRef.slice(0, 9),
  date: upstreamField('date'),
  commitUrl: `${upstreamField('repo').replace(/\.git$/, '')}/commit/${upstreamRef}`,
};

const appUrl = process.env.DOCS_BASE_URL
  ? `https://astrarocket.github.io${process.env.DOCS_BASE_URL.replace(/docs\/$/, '')}`
  : 'https://astrarocket.github.io/simulator/';

const config: Config = {
  title: 'AstraRocket',
  tagline: 'Design and simulate model rockets in your browser',
  favicon: 'img/favicon.svg',

  url: 'https://astrarocket.github.io',
  // Not from NODE_ENV: `docusaurus serve` re-evaluates this config as development.
  baseUrl: process.env.DOCS_BASE_URL || '/',
  organizationName: 'AstraRocket',
  projectName: 'simulator',

  customFields: { upstream, appVersion: version },

  // The offline Help dialog requests each page's own index.html.
  trailingSlash: true,
  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    localeConfigs: {
      en: { label: 'English' },
      es: { label: 'Español' },
    },
  },

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        language: ['en', 'es'],
        // Not 'filename': a tab on the previous build would 404 on a deleted index.
        hashed: true,
        // Only the hash input; the default misses Spanish-only changes.
        docsDir: ['docs', 'i18n'],
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: '/',
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/AstraRocket/simulator/tree/master/website/',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
    navbar: {
      title: 'AstraRocket',
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Documentation' },
        { href: appUrl, label: 'Launch the app', position: 'right' },
        { type: 'localeDropdown', position: 'right' },
        { href: 'https://github.com/AstraRocket/simulator', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      copyright: footerCopyright(),
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
