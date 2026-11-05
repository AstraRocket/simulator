import { useSyncExternalStore } from 'react';
import { tokenValues } from '../common/colorTokens';

/** Read as values because three.js cannot resolve CSS variables. */
export const SCENE_TOKENS = [
  'scene-sky',
  'scene-ground',
  'scene-floor',
  'scene-grid',
  'scene-grid-minor',
  'scene-marker',
  'scene-light-key',
  'scene-light-fill',
  'scene-callout',
  'scene-callout-light',
  'scene-selected',
  'scene-selected-glow',
  'scene-cg',
  'scene-cp',
  'scene-stable-ok',
  'scene-stable-over',
  'scene-stable-under',
] as const;

export type SceneToken = (typeof SCENE_TOKENS)[number];
export type SceneColors = Readonly<Record<SceneToken, string>>;

const UNRESOLVED = '#808080';

let cached: { key: string; colors: SceneColors } | null = null;
// `getSnapshot` runs every render and a read forces style resolution.
let stale = true;
let watchers = 0;

function snapshot(): SceneColors {
  if (cached && !stale) return cached.colors;
  const read = tokenValues();
  const values = SCENE_TOKENS.map((name) => read(name) || UNRESOLVED);
  const key = values.join('|');
  // Same object while unchanged, so memos keyed on it hold.
  if (cached?.key !== key) {
    cached = { key, colors: Object.fromEntries(SCENE_TOKENS.map((n, i) => [n, values[i]!])) as SceneColors };
  }
  // Trusted only while a subscription is watching for the next change.
  stale = watchers === 0;
  return cached.colors;
}

function subscribe(onChange: () => void): () => void {
  watchers++;
  // A change before this observer existed is never delivered; React rereads after subscribing.
  stale = true;
  const changed = () => {
    stale = true;
    onChange();
  };
  const root = document.documentElement;
  const observer = new MutationObserver(changed);
  observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  scheme?.addEventListener('change', changed);
  return () => {
    watchers--;
    if (watchers === 0) stale = true;
    observer.disconnect();
    scheme?.removeEventListener('change', changed);
  };
}

export function useSceneColors(): SceneColors {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
