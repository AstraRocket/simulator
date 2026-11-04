import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../..', import.meta.url));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'vendor' || entry === 'node_modules') continue;
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const srcFiles = walk(`${web}src`);
const testFiles = [...walk(`${web}tests`), ...walk(`${web}e2e`)];

const cache = new Map<string, string>();
const text = (f: string): string => {
  const hit = cache.get(f);
  if (hit !== undefined) return hit;
  const t = readFileSync(f, 'utf8');
  cache.set(f, t);
  return t;
};

const EXPORT_LIST = /^export\s+\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?\s*;?/gm;

type Exported = { name: string; forwarded: boolean };

const exportedValues = (t: string): Exported[] => {
  const out: Exported[] = [];
  const decl = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  for (const m of t.matchAll(decl)) out.push({ name: m[1]!, forwarded: false });
  const imports = [...t.matchAll(/^import\s+(?!type\b)[^;]*?\{([^}]*)\}[^;]*?from/gm)]
    .flatMap((m) => m[1]!.split(','))
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('type '))
    .map((s) => s.split(/\s+as\s+/).pop()!);
  for (const m of t.matchAll(EXPORT_LIST)) {
    for (const raw of m[1]!.split(',')) {
      const item = raw.trim();
      if (!item || item.startsWith('type ')) continue;
      const [local, exported = local] = item.split(/\s+as\s+/);
      out.push({ name: exported!, forwarded: m[2] !== undefined || imports.includes(local!) });
    }
  }
  return out;
};

const occurrences = (t: string, name: string): number => (t.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;

const mentionedElsewhere = (files: string[], name: string, self: string): boolean =>
  files.some((f) => f !== self && occurrences(text(f), name) > 0);

const modulePath = (file: string): string =>
  file
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\.(ts|tsx)$/, '');

const importsFrom = (from: string, self: string): boolean => {
  const dir = modulePath(from).replace(/\/[^/]*$/, '');
  const target = modulePath(self);
  for (const m of text(from).matchAll(/\bfrom\s*['"](\.[^'"]*)['"]/g)) {
    const parts = `${dir}/${m[1]!}`.split('/');
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p !== '.') resolved.push(p);
    }
    const spec = resolved.join('/');
    if (spec === target || `${spec}/index` === target) return true;
  }
  return false;
};

const reachedThrough = (files: string[], name: string, self: string): boolean =>
  files.some((f) => f !== self && occurrences(text(f), name) > 0 && importsFrom(f, self));

const testOnlyExports = (): string[] => {
  const found: string[] = [];
  for (const file of srcFiles) {
    const t = text(file);
    for (const { name, forwarded } of exportedValues(t)) {
      const where = `${file.slice(web.length).replace(/\\/g, '/')}#${name}`;
      if (forwarded) {
        if (reachedThrough(srcFiles, name, file)) continue;
        if (reachedThrough(testFiles, name, file)) found.push(where);
        continue;
      }
      if (occurrences(t.replace(EXPORT_LIST, ''), name) > 1) continue;
      if (mentionedElsewhere(srcFiles, name, file)) continue;
      if (!mentionedElsewhere(testFiles, name, file)) continue;
      found.push(where);
    }
  }
  return found.sort();
};

const BASELINE = [
  'src/engine/openRocketEngine.ts#__setEngineForTests',
  'src/components/tools/LandingEstimator.tsx#forgetLandingEstimator',
  'src/components/tools/ParachuteTool.tsx#forgetParachuteTool',
  'src/components/tools/ToolsPane.tsx#forgetToolsPane',
  'src/services/app/helpSearch.ts#resetHelpIndex',
  'src/services/weather/openMeteo.ts#resetWeatherState',
  'src/services/weather/openMeteo.ts#setWeatherTransport',
  'src/services/report/reportFonts.ts#resetReportFontsForTests',
];

describe('src exports reached only from tests are a decision', () => {
  const found = testOnlyExports();

  it('adds none that is not in the baseline', () => {
    expect(found.filter((e) => !BASELINE.includes(e))).toEqual([]);
  });

  it('keeps no baseline entry that is no longer test-only', () => {
    expect(BASELINE.filter((e) => !found.includes(e))).toEqual([]);
  });

  it('actually finds things, so a broken scan cannot pass as a clean repo', () => {
    expect(found).toHaveLength(BASELINE.length);
    expect(srcFiles.length).toBeGreaterThan(200);
    expect(testFiles.length).toBeGreaterThan(200);
  });
});
