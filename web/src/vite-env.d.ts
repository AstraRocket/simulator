/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** When set, the build leaves its own catalog copy out (vite.config.ts). */
  readonly VITE_DATA_BASE?: string;
}
