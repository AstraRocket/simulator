# Code Quality Assessment

2026-11-04

How the codebase rates on structure, readability and robustness. The assessment is based on layout and metrics across `web/src` (about 74k lines, down from 102k almost entirely through the comment trim), `engine-java`, the lint and tsconfig setup, and CI, plus a sample of the main store, the engine bridge and several components. It is not a line-by-line audit.

## Summary

| Area        | Grade |
| ----------- | ----- |
| Structure   | A-    |
| Readability | A-    |
| Robustness  | A     |

This is a mature, heavily gated codebase. Structure moved up from B+ after the store, `LaunchPanel.tsx` and `flightPathExport.ts` splits. Readability and Robustness hold their grades: the comment trim removed a lot of noise, but it ran without review and at least two useful explanations were lost and had to be restored. The main remaining debt is a handful of dense modules.

## Structure: A-

### Strengths

- Layers are clean. `engine/` wraps the TeaVM kernel, `services/` holds domain logic (design, flight, files, motors, storage, weather, exports), `components/` holds UI, and `state/` holds stores. Domain code does not import from UI.
- Separate tsconfigs for app, tests, e2e and node, each with a clear scope.
- The vendored OpenRocket Java is kept apart in `engine-java/`, with its own patches, reference data and validation folders.
- CI goes through one place: `.github/workflows/gates.yml` defines the checks and `ci.yml` only calls it.

### Weaknesses

- `web/src/state/store.ts` was 2,108 lines with about 63 actions, the obvious god-object risk. **Resolved 2026-11-03:** flight configurations, simulations, batch runs, the drift sweep and the motor guide now live in their own slices, and the store keeps the design tree, undo history and workspace swap (456 lines):

  | File                 | Lines |
  | -------------------- | ----- |
  | `store.ts`           | 456   |
  | `configSlice.ts`     | 246   |
  | `simSlice.ts`        | 200   |
  | `motorGuideSlice.ts` | 182   |
  | `runSlice.ts`        | 158   |
  | `driftSweepSlice.ts` | 150   |
  | `runBasis.ts`        | 52    |
  | `sliceShared.ts`     | 18    |
- No file is over 950 lines now, but that mostly reflects the comment trim. These modules hold about as much code as before:

  | File                                         | Lines |
  | -------------------------------------------- | ----- |
  | `components/canvas/FlightPath3D.tsx`         | 862   |
  | `services/files/rktImport.ts`                | 844   |
  | `engine/openRocketEngine.ts`                 | 840   |
  | `services/design/treeEdit.ts`                | 807   |
  | `components/canvas/schematicShapes.tsx`      | 757   |
  | `services/design/autoRadius.ts`              | 735   |

- 8 components are over 500 lines, down from 13, again mostly through the trim. `components/sim/LaunchPanel.tsx` had about 40 imports, a sign it did too many jobs. **Resolved 2026-11-03:** it is now a 66-line shell over one component per card.

## Readability: A-

### Strengths

- Comments explain *why*: invariants, units, ordering constraints, platform quirks and desktop parity. The `openRocketEngine.ts` header (SI units, which fields are in degrees, why import order matters) is a good example.
- Names are descriptive and consistent (`selectOutdated`, `withKernelEnds`, `reconcileConfigs`).
- Prettier and jscpd (duplicate detection, threshold 0) run in `npm run check` and block every pull request.

### Weaknesses

- The comments were sometimes long enough to be hard to read. **Resolved 2026-11-03:** every hand-written source file (web, website and the engine-java bridge, shims and tooling) was trimmed to one-line comments that prevent a bug or a wrong fix: traps, platform quirks, units, desktop parity rules and license and terms-of-use notes. Comment lines went from about 52,000 to 4,850, with a check that nothing but comments changed. The strict pass had no reviewers, and some useful explanations went with it: the `e2e/base.ts` retry reason and the parity limit reasoning have already been restored, so others may turn up.
- jscpd reported 4 clones against its threshold of 0, so the check failed. **Resolved 2026-11-04:** it now finds none. Shared pieces replaced the copies: `SchematicDefs`, `ReadoutOpener`, `StepperOptions` and a `DeviceSelect` inside `StageRecovery.tsx`.
- Large import blocks and big files make it slow to get your bearings. This ties back to the structure weaknesses.

## Robustness: A

### Strengths

- TypeScript is in its strictest practical mode: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`. There is essentially one real `any` (a generic constraint in `ErrorBoundary.tsx`) and zero `@ts-ignore`.
- ESLint runs type-checked rules (`no-floating-promises`, `no-unsafe-*`) and React-Compiler hook rules with `--max-warnings 0`.
- Error handling is deliberate:
  - No empty catch blocks.
  - Errors are keyed for i18n through `KeyedError`.
  - Async work checks abort signals and "is this result still mine" guards.
  - Simulations run in a worker with timeout and cancel error types.
- Tests are heavy:
  - 648 unit test files, which is more tracked files than `src` has.
  - Sharded Playwright e2e, plus offline-data and update-flow checks.
  - Differential tests on the Java engine, run by hand. All 368 values match the golden file exactly, and the browser targets stay within the limits on every line (0.5% for flight, 1% in gusty wind).
  - knip for dead code.
- The engine loader falls back from WASM to JS when the browser lacks support or the load stalls.

### Weaknesses

- 22 `eslint-disable` comments and 54 TODO/FIXME markers. **Checked 2026-11-03:**
  - `eslint --report-unused-disable-directives` finds none unused. Two `react-hooks/exhaustive-deps` disables (`FlightGroundMap.tsx`, `NumberInput.tsx`) were replaced with `useEffectEvent`, leaving 20. All 20 are deliberate and give their reason. 19 are `jsx-a11y` rules: 15 on ARIA patterns the rules do not model (roving tabindex in menus and the tree, focusable chart crosshairs and the site map, the window splitter, dialog backdrop clicks) and 4 where the rule sees only the JSX (link text filled in by `<Trans>`, a scrollable pane that needs a tab stop, an Enter handler catching keys bubbled up from a form). The last is the `any` in `lazyNamed`, which is `React.lazy`'s own constraint.
  - `web/src` has no TODO markers. The earlier count matched a reference to `TODO.md` and currency codes in the vendored engine bundle. The 50 in `engine-java/src` are all upstream OpenRocket's own and are left as-is, so the extracted code stays comparable with upstream.
- `services/storage/workspaceStore.ts` (352 lines) is the likeliest home left for race and ordering bugs. `store.ts` and `fileSlice.ts` have been split (see Structure and Recommendations), and the unload journal moved to `workspaceJournal.ts` on 2026-11-04. The rest is one class whose methods all share the same fields (active id, generation, last-seen stamp), so it stays whole on purpose: splitting it would spread that state across files and make the ordering harder to follow. The generation counters and claim tokens are the guard here.
- The repo checks in `npm run audit` failed, and knip reported two unused exports. Both ran only by hand, so they could fail unnoticed. **Resolved 2026-11-04,** and the repo checks are now a CI gate (the `repo` job in `gates.yml`). knip still runs by hand:
  - `srcExportReach.test.ts` flagged 18 exports. 11 were deliberate test hooks and joined its baseline. 6 were names `flightPathExport.ts` re-exported for tests alone, and those tests now import from `flightPath/`. `findCatalogMotor` had no production caller and was removed.
  - `scriptsReferenced.test.ts` had two faults in the test itself: it missed sibling imports such as `./rankCurves.mjs`, and it relied on comments the trim removed.
  - knip: the unused `Key` type was deleted, and `DEADLINE_MS` is no longer exported.
- The desktop checks in `npm run audit` compared against the OpenRocket 24.12 release, far behind the commit the engine runs, so most of their expected differences were version noise. **Resolved 2026-11-04:** they now build and compare against the engine's own commit (`npm run openrocket:build`). Two items remain:
  - **Open bug:** for a multi-stage `.rkt`, the sustainer mass and CG the app weighs differ from desktop's (816.48 g and 635.02 mm against 818.10 g and 634.09 mm on `every-part`), which moves the booster's derived CG by about 3.4 mm. The cause is not yet found. `check-desktop-fields.mjs` lists it as `OPEN`.
  - The catalog's motor and preset digests are still synced from the 24.12 release, so they differ from what the engine's commit computes. Desktop still resolves the same motors by name.
- The last full e2e run passed 596 of 597. The one failure was a preview-server refusal under load that passes alone; `openApp` now pauses between retries, but a full run has not confirmed the fix.

## Recommendations

In priority order:

1. ~~Split `store.ts` into more slices: simulations, flight configs, and sweeps/motor guide.~~ Done 2026-11-03.
2. ~~Break up `LaunchPanel.tsx` into smaller sections (wind, rod, site, atmosphere).~~ Done 2026-11-03: one component per card (`LaunchRodSection`, `LaunchSiteSection`, `AtmosphereSection`, `WindSection`, `EarthModelSection`), `QNum` in its own file, and `LaunchPanel.tsx` down from 728 to 66 lines.
3. ~~Split `flightPathExport.ts` into smaller modules.~~ Done 2026-11-03: the parts live in `services/exports/flightPath/` (`options`, `colors`, `model`, `buildModel`, `formats`, `userTemplate`), and `flightPathExport.ts` is a 21-line entry point that re-exports what the app uses. `buildBranch`, once a 230-line function, is now a short assembly of named steps (samples, range, landing, event and peak waypoints, track points), checked byte-for-byte against the previous output.
4. ~~Check the `eslint-disable` comments and TODO markers from time to time and remove the ones that no longer apply.~~ Done 2026-11-03; see Robustness. Worth repeating now and then: `npx eslint src --report-unused-disable-directives-severity error` catches a stale disable.
5. ~~Clear the 4 jscpd clones so the duplicate check passes again.~~ Done 2026-11-04; see Readability.
6. ~~Split `state/fileSlice.ts` (639 lines), the largest stateful file and the likeliest home for race and ordering bugs.~~ Done 2026-11-04: `fileSlice.ts` keeps opening, importing and replacing the workspace (247 lines), `designLibrarySlice.ts` holds the saved designs (140), `exportSlice.ts` holds saving and exporting (240), and `workspaceHandoff.ts` holds the claim tokens and the flush they all share (55). The action bodies moved unchanged.
