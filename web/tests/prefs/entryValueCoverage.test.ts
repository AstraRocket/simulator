import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/[ \t]\/\/.*$/gm, '');
}

function sources(dir: string, out: { path: string; code: string }[] = []): { path: string; code: string }[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sources(full, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push({ path: relative(SRC, full).replace(/\\/g, '/'), code: code(readFileSync(full, 'utf8')) });
    }
  }
  return out;
}

const RAW_CONVERSION_ALLOWED = ['prefs/units.ts', 'prefs/useUnits.ts', 'components/canvas/TreeSchematic.tsx'];

const OR_FALLBACK_ALLOWED = ['components/canvas/flightScene.ts'];

describe('entry-value coverage', () => {
  const files = sources(SRC);

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('converts typed numbers through toSi, never fromUi', () => {
    const offenders = files
      .filter((f) => !RAW_CONVERSION_ALLOWED.includes(f.path))
      .filter((f) => /\bfromUi\(/.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('never falls back from a parsed number with ||', () => {
    const offenders = files
      .filter((f) => !OR_FALLBACK_ALLOWED.includes(f.path))
      .filter((f) => /(?:Number|parseFloat|parseInt)\([^)]*\)\s*\|\|/.test(f.code))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
