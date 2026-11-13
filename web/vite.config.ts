import { readFileSync, rmSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { CATALOG_CACHE, MAP_TILE_CACHE } from './src/services/app/cacheNames.ts';

interface PackageInfo {
  version: string;
  repository?: { url?: string };
  wiki?: { url?: string };
  contributorsPage?: { url?: string };
}
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as PackageInfo;

const CHANNEL_TITLES: Record<string, string> = {
  '': 'AstraRocket',
  dev: 'AstraRocket Dev',
  beta: 'AstraRocket Beta',
  hotfix: 'AstraRocket Hotfix',
};
const channel: string = process.env.APP_CHANNEL?.trim() ?? '';
if (!Object.hasOwn(CHANNEL_TITLES, channel)) {
  throw new Error(`APP_CHANNEL must be '', 'dev', 'beta' or 'hotfix', not '${channel}'`);
}
const appTitle: string = CHANNEL_TITLES[channel] ?? 'AstraRocket';

const baseVersion: string = process.env.APP_VERSION_OVERRIDE || pkg.version;
const runNumber = process.env.GITHUB_RUN_NUMBER;
const version: string = channel ? `${baseVersion}-${channel}${runNumber ? `.${runNumber}` : ''}` : baseVersion;

// Must increase per build: the CDN can serve an older sw.js, so the page only takes a
// higher id (services/app/swBuild.ts). The script name is per build to dodge stale CDN copies.
const buildId = Date.now();
const swBuildFile = `sw-build-${buildId}.js`;
const swBuildSource = `// Answers the page's "which build are you?" (services/app/swBuild.ts).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_BUILD' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ build: ${buildId} });
  }
});
`;

const repoUrl: string = (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
const helpUrl: string = process.env.HELP_URL || pkg.wiki?.url || (repoUrl ? `${repoUrl}/wiki` : '');

// `contributorsPage`, not `contributors`: that key is npm's own people array.
const contributorsUrl: string =
  process.env.CONTRIBUTORS_URL ?? pkg.contributorsPage?.url ?? (repoUrl ? `${repoUrl}/graphs/contributors` : '');

const upstreamText = readFileSync(new URL('../engine-java/extract/UPSTREAM', import.meta.url), 'utf-8');
const upstreamFields = new Map(
  upstreamText
    .split('\n')
    .map((line) => /^(\w+)\s*=\s*(\S+)/.exec(line))
    .filter((m) => m !== null)
    .map((m) => [m[1]!, m[2]!] as const),
);
const upstreamField = (key: string): string => {
  const value = upstreamFields.get(key);
  if (!value) throw new Error(`engine-java/extract/UPSTREAM has no \`${key}\` line`);
  return value;
};
const upstreamRef = upstreamField('ref');
const upstreamRepo = upstreamField('repo').replace(/\.git$/, '');
const upstream = {
  ref: upstreamRef,
  shortRef: upstreamRef.slice(0, 9),
  date: upstreamField('date'),
  commitUrl: `${upstreamRepo}/commit/${upstreamRef}`,
};

const hostedCatalogs = process.env.VITE_DATA_BASE?.trim()
  ? ['data/motors.generated.json', 'data/components.generated.json']
  : [];

export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  plugins: [
    react(),
    tailwindcss(),
    // The prefix rule must match services/storage/storageKeys.ts.
    {
      name: 'html-channel',
      transformIndexHtml: {
        order: 'pre' as const,
        handler: (html: string) =>
          html
            .replaceAll('%APP_TITLE%', appTitle)
            .replaceAll('%STORAGE_PREFIX%', channel ? `astrarocket-${channel}` : 'astrarocket'),
      },
    },
    {
      name: 'sw-build-id',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: swBuildFile, source: swBuildSource });
      },
    },
    (() => {
      // The resolved folder, not `./dist`, so a build given `--outDir` still drops them.
      let outDir = '';
      return {
        name: 'drop-hosted-catalogs',
        apply: 'build' as const,
        configResolved(config: { root: string; build: { outDir: string } }) {
          outDir = resolvePath(config.root, config.build.outDir);
        },
        closeBundle() {
          for (const file of hostedCatalogs) rmSync(resolvePath(outDir, file), { force: true });
        },
      };
    })(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a silent activate reloads the page mid-edit.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: appTitle,
        short_name: appTitle,
        description: 'Design and simulate model rockets in your browser.',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'any',
        // Relative so it resolves against `base`.
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,json,ork}'],
        // The JS engine fallback is runtime-cached on use; the docs search index is hidden in Help.
        globIgnores: [
          '**/openrocket-engine-*.js',
          '**/search-index*.json',
          '**/sw-build-*.js',
          ...hostedCatalogs.map((file) => `**/${file}`),
        ],
        importScripts: [swBuildFile],
        // The WASM kernel alone is ~2.5 MB, over Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // The precache is keyed without `?v=` (remoteData.ts) and `?retry=` (openRocketEngine.ts).
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/, /^retry$/],
        cleanupOutdatedCaches: true,
        // Both off so navigations reach the network-first route and a reload shows a new deploy.
        navigateFallback: null,
        directoryIndex: '',
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !url.pathname.includes('/docs/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'astra-shell',
              networkTimeoutSeconds: 3,
              precacheFallback: { fallbackURL: 'index.html' },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Precache holds `docs/<slug>/index.html`; with directoryIndex off, `docs/<slug>/` needs this.
            urlPattern: ({ request, url }) => request.mode === 'navigate' && url.pathname.includes('/docs/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'astra-docs',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Not stale-while-revalidate: an old manifest names hashes nothing cached offline.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/.*@data\/manifest\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: CATALOG_CACHE,
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // No maxAgeSeconds: this is the only offline copy and Workbox refuses expired entries.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/gh\/.*@data\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: CATALOG_CACHE,
              expiration: { maxEntries: 16 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/openrocket-engine-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'astra-engine-js',
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Never revalidated: bump the cache name when public/fonts changes.
            urlPattern: /\/fonts\/[\w-]+\.ttf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'astra-report-fonts-v1',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // No maxAgeSeconds on purpose (scripts/check-offline-data.mjs).
            urlPattern:
              /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/(World_Imagery|World_Street_Map)\//,
            handler: 'CacheFirst',
            options: {
              // Versioned: older opaque entries cannot answer the CORS requests WebGL makes.
              cacheName: MAP_TILE_CACHE,
              expiration: { maxEntries: 1200 },
              cacheableResponse: { statuses: [0, 200] },
              // Drop the Esri token so it is never stored and a new key keeps cached tiles.
              plugins: [
                {
                  cacheKeyWillBeUsed: ({ request }) => {
                    const url = new URL(request.url);
                    url.searchParams.delete('token');
                    return Promise.resolve(url.href);
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_CHANNEL__: JSON.stringify(channel),
    __HELP_URL__: JSON.stringify(helpUrl),
    __CONTRIBUTORS_URL__: JSON.stringify(contributorsUrl),
    __UPSTREAM__: JSON.stringify(upstream),
  },
  // The sim worker dynamic-imports the engine; only ES format can code-split.
  worker: { format: 'es' },
});
