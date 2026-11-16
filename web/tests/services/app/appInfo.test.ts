// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defaultDesignName, designNameOf, isPreRelease, LOGO_URL } from '../../../src/services/app/appInfo';

describe('isPreRelease', () => {
  it('is true for pre-1.0 (major 0) versions', () => {
    expect(isPreRelease('0.0.0')).toBe(true);
    expect(isPreRelease('0.1.0')).toBe(true);
    expect(isPreRelease('0.9.9')).toBe(true);
    expect(isPreRelease('0.0.0-test')).toBe(true);
  });

  it('is false once the major version reaches 1 or beyond', () => {
    expect(isPreRelease('1.0.0')).toBe(false);
    expect(isPreRelease('1.2.3')).toBe(false);
    expect(isPreRelease('2.0.0')).toBe(false);
  });

  it('defaults to the build version (the test build is pre-1.0)', () => {
    expect(isPreRelease()).toBe(true); // __APP_VERSION__ = '0.0.0-test'
  });
});

describe('engine-java/extract/UPSTREAM', () => {
  const text = readFileSync(resolve(process.cwd(), '../engine-java/extract/UPSTREAM'), 'utf8');
  const field = (key: string) =>
    text
      .split('\n')
      .map((line) => /^(\w+)\s*=\s*(\S+)/.exec(line))
      .find((m) => m?.[1] === key)?.[2];

  it('names a repo, a ref, a date and a describe', () => {
    expect(field('repo')).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
    expect(field('ref')).toMatch(/^[0-9a-f]{40}$/);
    expect(field('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(field('describe')).toBeTruthy();
  });

  it('dates the pin plausibly', () => {
    const date = new Date(`${field('date')}T00:00:00Z`);
    expect(Number.isNaN(date.getTime())).toBe(false);
    expect(date.getUTCFullYear()).toBeGreaterThanOrEqual(2020);
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('describes the commit it pins', () => {
    expect(field('describe')).toMatch(new RegExp(`g${field('ref')!.slice(0, 7)}`));
  });
});

describe('designNameOf', () => {
  it('prefers the rocket name, then the imported file, then the default', () => {
    expect(designNameOf({ name: 'Renamed' }, { name: 'imported' })).toBe('Renamed');
    expect(designNameOf({}, { name: 'imported' })).toBe('imported');
    expect(designNameOf({ name: '   ' }, null)).toBe(defaultDesignName());
    expect(designNameOf({}, undefined)).toBe(defaultDesignName());
  });

  it('is the only place the chain is written', () => {
    const src = resolve(__dirname, '../../../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== 'vendor') walk(path);
        } else if (/\.tsx?$/.test(entry) && !path.endsWith(join('app', 'appInfo.ts'))) {
          const text = readFileSync(path, 'utf8');
          if (/loadedMeta\?\.name(\?\.trim\(\))?\s*\|\||\|\|\s*loadedMeta\?\.name|'My Rocket'/.test(text)) {
            offenders.push(path.slice(src.length + 1));
          }
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

describe('LOGO_URL', () => {
  it('sits under the base path with one slash', () => {
    expect(LOGO_URL).toMatch(/[^/]\/favicon\.svg$|^\/favicon\.svg$/);
    expect(LOGO_URL).not.toContain('//');
  });
});
