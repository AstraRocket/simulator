import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wf = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url)), 'utf8');

describe('CI trigger coverage', () => {
  it('runs the gate set on every pull request', () => {
    expect(wf('ci.yml')).toMatch(/on:\s*\n\s*pull_request:/);
    expect(wf('ci.yml')).toContain('uses: ./.github/workflows/gates.yml');
  });

  it('runs the repo checks in the gate set, which the unit suite leaves out', () => {
    const job = wf('gates.yml')
      .split(/^ {2}repo:\s*$/m)[1]
      ?.split(/^ {2}\w[\w-]*:\s*$/m)[0];
    expect(job).toBeDefined();
    expect(job).toMatch(/- run: npx vitest run tests\/repo\n\s+env:\n\s+REPO_CHECKS: '1'/);
  });

  it('installs the docs site for the repo checks, whose footer test loads its config', () => {
    const job = wf('gates.yml')
      .split(/^ {2}repo:\s*$/m)[1]
      ?.split(/^ {2}\w[\w-]*:\s*$/m)[0];
    expect(job).toMatch(/working-directory: website\n\s+run: npm ci/);
    expect(job).toContain('path: website/node_modules');
  });

  it('blocks a pull request on the housekeeping checks', () => {
    expect(wf('gates.yml')).toContain('check: [format:check, spell, knip, dupes]');
  });

  it('runs coverage and the full e2e suite only on a pull request into master', () => {
    const job = (name: string) => wf('gates.yml').split(new RegExp(`^ {2}${name}:\\s*$`, 'm'))[1];
    expect(job('coverage')).toMatch(/^\s*if: github\.base_ref == 'master'/);
    expect(job('coverage')).toContain('- run: npx vitest run --coverage');
    expect(job('e2e-full')).toMatch(
      /^\s*if: github\.base_ref == 'master'\s+uses: \.\/\.github\/workflows\/e2e-full\.yml/,
    );
    expect(wf('e2e-full.yml')).toMatch(/^on:\s*\n\s*workflow_call:/m);
  });

  it('typechecks the docs site in the gate set', () => {
    const site = wf('gates.yml').split(/^ {2}website:s*$/m)[1];
    expect(site).toBeDefined();
    expect(site).toMatch(/working-directory: website/);
    expect(site).toMatch(/- run: npm run typecheck/);
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../website/package.json', import.meta.url)), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['typecheck']).toBe('tsc');
  });
});

describe('the catalog sync trigger', () => {
  const sync = wf('sync-catalogs.yml');

  it('runs on a push to master that changes the scripts, the workflow or the engine', () => {
    expect(sync).toMatch(
      /^on:\s*\n\s*push:\s*\n\s*branches:\s*\[master\]\s*\n\s*paths:\s*\n\s*- 'web\/scripts\/\*\*'\s*\n\s*- '\.github\/workflows\/sync-catalogs\.yml'\s*\n\s*- 'web\/src\/engine\/vendor\/\*\*'\s*\n/m,
    );
  });

  it('watches the folder of the engine the volume script loads', () => {
    const script = readFileSync(fileURLToPath(new URL('../../scripts/lib/presetVolume.mjs', import.meta.url)), 'utf8');
    const folder = script.match(/new URL\('\.\.\/\.\.\/(src\/engine\/vendor)\/[^']+'/)?.[1];
    expect(folder).toBe('src/engine/vendor');
    expect(sync).toContain(`- 'web/${folder}/**'`);
  });

  it('keeps the schedule, the manual run and the no-cancel concurrency group', () => {
    expect(sync).toMatch(/^\s*schedule:\s*\n(?:\s*#.*\n)*\s*- cron:/m);
    expect(sync).toMatch(/^\s*workflow_dispatch:\s*\n\s*inputs:\s*\n\s*target:/m);
    expect(sync).toMatch(/concurrency:\s*\n\s*group: sync-catalogs\s*\n\s*cancel-in-progress: false/);
  });

  it('regenerates both catalogs when no target is given', () => {
    expect(sync.match(/inputs\.target/g)).toHaveLength(1);
    expect(sync).toContain("TARGET: ${{ inputs.target || 'both' }}");
  });
});

describe('the verify checks', () => {
  for (const [file, name] of [['ci.yml', 'CI']] as const) {
    it(`${name} / verify runs after every gate and fails when one does`, () => {
      const text = wf(file);
      expect(text).toMatch(new RegExp(`^name: ${name}$`, 'm'));
      const job = text.split(/^ {2}verify:\s*$/m)[1]?.split(/^ {2}\S/m)[0] ?? '';
      expect(job).toMatch(/needs: gates/);
      expect(job).toMatch(/if: always\(\)/);
      expect(job).toMatch(/if: needs\.gates\.result != 'success'[\s\S]*exit 1/);
    });
  }
});

describe('every job has a timeout', () => {
  const FILES = readdirSync(fileURLToPath(new URL('../../../.github/workflows/', import.meta.url))).filter((f) =>
    /\.ya?ml$/.test(f),
  );

  const jobsOf = (text: string): [string, string][] => {
    const after = text.split(/^jobs:\s*$/m)[1];
    if (!after) return [];
    const out: [string, string][] = [];
    const parts = after.split(/^ {2}([A-Za-z][\w-]*):\s*$/m);
    for (let i = 1; i < parts.length; i += 2) out.push([parts[i]!, parts[i + 1] ?? '']);
    return out;
  };

  it('caps every job that runs steps', () => {
    const uncapped: string[] = [];
    for (const f of FILES) {
      for (const [name, body] of jobsOf(wf(f))) {
        if (/^\s*uses:/m.test(body) && !/^\s*steps:/m.test(body)) continue;
        if (!/^\s*timeout-minutes:\s*\d+/m.test(body)) uncapped.push(`${f}#${name}`);
      }
    }
    expect(uncapped).toEqual([]);
  });

  it('finds the jobs at all, so a broken split cannot pass', () => {
    const names = FILES.flatMap((f) => jobsOf(wf(f)).map(([n]) => n));
    expect(names).toContain('build-and-test');
    expect(names).toContain('e2e');
    expect(names).toContain('sync');
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  it('leaves no cap at the 360-minute default by writing it out', () => {
    for (const f of FILES) expect(wf(f), f).not.toMatch(/timeout-minutes:\s*360/);
  });
});
