import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The gate workflows' triggers.
 *
 * Deliberately a textual assertion rather than a parsed one: the hazard is the
 * shape of the config, not a value computed from it, and parsing would mean
 * importing a YAML package that is only present transitively, which `knip`
 * would then report as an unlisted dependency.
 */
const wf = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../.github/workflows/${name}`, import.meta.url)), 'utf8');

describe('CI trigger coverage', () => {
  it('runs the gate set on every pull request', () => {
    expect(wf('ci.yml')).toMatch(/on:\s*\n\s*pull_request:/);
    expect(wf('ci.yml')).toContain('uses: ./.github/workflows/gates.yml');
  });

  it('typechecks the docs site in the gate set', () => {
    // Docusaurus builds through Babel and checks no types, so the gate set is
    // the only place a type error in website/ is caught.
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

/**
 * The catalog sync runs when the pipeline changes. Its header states the
 * policy: the Monday schedule, a manual run, and a push to master that changes
 * `web/scripts/**`, the workflow itself or the vendored engine, so a pipeline
 * change republishes the catalogs when it lands instead of waiting up to a
 * week. The engine measures the volume each stated mass is spread over
 * (`scripts/lib/presetVolume.mjs`), so a new engine is a new catalog. Master
 * only, and those paths only, because the run publishes to the branch the live
 * app reads; a push run carries no `inputs.target`, so the target has to default.
 */
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
    // The one place the input is read; a push run has none.
    expect(sync.match(/inputs\.target/g)).toHaveLength(1);
    expect(sync).toContain("TARGET: ${{ inputs.target || 'both' }}");
  });
});

/**
 * The one check for every gate: `CI / verify` on a pull request. It has to run
 * when a gate fails and fail with it:
 * a job skipped because a job it needs failed reports as skipped, and a skipped
 * check counts as passing wherever it is required.
 */
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

/**
 * Every job that runs steps has a wall-clock cap.
 *
 * A job without one inherits GitHub's 360-minute default: per shard for a
 * sharded `e2e` matrix, and on a `sync` job that holds `contents: write`
 * against the `data` branch the live app reads. The cap is
 * not about slowness: it is about a hang. A Playwright locator waiting on an
 * element that never appears, a deadlocked kernel build, a fetch with no timeout
 * of its own; uncapped, each of those sits burning runner minutes for six hours
 * with the PR showing "in progress".
 *
 * Textual, like the trigger assertions above, and for the same two reasons: the
 * hazard is the shape of the config, and parsing would mean a YAML dependency that
 * knip would then report as unlisted.
 *
 * A job that only calls a reusable workflow (`uses: ./.github/workflows/...`) is
 * skipped: it runs no steps of its own, and its duration is the sum of the called
 * workflow's jobs, each of which is capped here.
 */
describe('every job has a timeout', () => {
  // Every workflow in the folder, so a new one is checked without being listed.
  const FILES = readdirSync(fileURLToPath(new URL('../../../.github/workflows/', import.meta.url))).filter((f) =>
    /\.ya?ml$/.test(f),
  );

  /** Job blocks in one workflow, as `[name, body]`, split on the 2-space indent. */
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
        if (/^\s*uses:/m.test(body) && !/^\s*steps:/m.test(body)) continue; // reusable-workflow call
        if (!/^\s*timeout-minutes:\s*\d+/m.test(body)) uncapped.push(`${f}#${name}`);
      }
    }
    expect(uncapped).toEqual([]);
  });

  it('finds the jobs at all, so a broken split cannot pass', () => {
    // Without this, a regex that stops matching makes the loop above iterate over
    // nothing and report a clean sweep of a file it never read.
    const names = FILES.flatMap((f) => jobsOf(wf(f)).map(([n]) => n));
    expect(names).toContain('build-and-test');
    expect(names).toContain('e2e');
    expect(names).toContain('sync');
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  it('leaves no cap at the 360-minute default by writing it out', () => {
    // A literal 360 restates the default rather than choosing a bound, so it
    // leaves the same hang uncapped.
    for (const f of FILES) expect(wf(f), f).not.toMatch(/timeout-minutes:\s*360/);
  });
});
