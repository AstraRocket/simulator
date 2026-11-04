# Code Quality Assessment

2026-11-03

How the codebase rates on structure, readability and robustness. The assessment is based on layout and metrics across `web/src` (about 102k lines), `engine-java`, the lint and tsconfig setup, and CI, plus a sample of the main store, the engine bridge and several components. It is not a line-by-line audit.

## Summary

| Area        | Grade |
| ----------- | ----- |
| Structure   | B+    |
| Readability | A-    |
| Robustness  | A     |

This is a mature, heavily gated codebase. Its main debt is file size and how much is concentrated in the central store and a handful of 1k+ line modules, not correctness or discipline.

## Structure: B+

### Strengths

- Layers are clean. `engine/` wraps the TeaVM kernel, `services/` holds domain logic (design, flight, files, motors, storage, weather, exports), `components/` holds UI, and `state/` holds stores. Domain code does not import from UI.
- Separate tsconfigs for app, tests, e2e and node, each with a clear scope.
- The vendored OpenRocket Java is kept apart in `engine-java/`, with its own patches, reference data and validation folders.
- CI goes through one place: `.github/workflows/gates.yml` defines the checks and `ci.yml` only calls it.

### Weaknesses

- `web/src/state/store.ts` was 2,108 lines with about 63 actions, the obvious god-object risk. **Resolved 2026-11-03:** flight configurations, simulations, batch runs, the drift sweep and the motor guide now live in their own slices, and the store keeps the design tree, undo history and workspace swap (699 lines):

  | File                 | Lines |
  | -------------------- | ----- |
  | `store.ts`           | 699   |
  | `configSlice.ts`     | 373   |
  | `simSlice.ts`        | 334   |
  | `runSlice.ts`        | 295   |
  | `driftSweepSlice.ts` | 253   |
  | `motorGuideSlice.ts` | 240   |
  | `runBasis.ts`        | 77    |
  | `sliceShared.ts`     | 33    |
- Several other files are 950 to 1,600 lines:

  | File                                         | Lines |
  | -------------------------------------------- | ----- |
  | `services/exports/flightPathExport.ts`       | 1,598 (split 2026-11-03) |
  | `engine/openRocketEngine.ts`                 | 1,500 |
  | `services/files/rktImport.ts`                | 1,258 |
  | `services/design/treeEdit.ts`                | 1,222 |
  | `services/design/autoRadius.ts`              | 1,016 |
  | `components/canvas/FlightPath3D.tsx`         | 1,015 |

- 13 components were over 500 lines (12 now). `components/sim/LaunchPanel.tsx` had about 40 imports, a sign it did too many jobs. **Resolved 2026-11-03:** it is now a 111-line shell over one component per card.

## Readability: A-

### Strengths

- Comments explain *why*: invariants, units, ordering constraints, platform quirks and desktop parity. The `openRocketEngine.ts` header (SI units, which fields are in degrees, why import order matters) is a good example.
- Names are descriptive and consistent (`selectOutdated`, `withKernelEnds`, `reconcileConfigs`).
- Prettier and jscpd (duplicate detection, threshold 0) are wired into the gates, so style and copy-paste stay under control.

### Weaknesses

- The comments were sometimes long enough to be hard to read. **Resolved 2026-11-03:** every hand-written source file (web, website and the engine-java bridge, shims and tooling) was trimmed to one-line comments that prevent a bug or a wrong fix: traps, platform quirks, units, desktop parity rules and license and terms-of-use notes. Comment lines went from about 52,000 to 4,850, with a check that nothing but comments changed.
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
  - Differential tests on the Java engine.
  - knip for dead code.
- The engine loader falls back from WASM to JS when the browser lacks support or the load stalls.

### Weaknesses

- 22 `eslint-disable` comments and 54 TODO/FIXME markers. **Checked 2026-11-03:**
  - `eslint --report-unused-disable-directives` finds none unused. Two `react-hooks/exhaustive-deps` disables (`FlightGroundMap.tsx`, `NumberInput.tsx`) were replaced with `useEffectEvent`, leaving 20. All 20 are deliberate and give their reason. 19 are `jsx-a11y` rules: 15 on ARIA patterns the rules do not model (roving tabindex in menus and the tree, focusable chart crosshairs and the site map, the window splitter, dialog backdrop clicks) and 4 where the rule sees only the JSX (link text filled in by `<Trans>`, a scrollable pane that needs a tab stop, an Enter handler catching keys bubbled up from a form). The last is the `any` in `lazyNamed`, which is `React.lazy`'s own constraint.
  - `web/src` has no TODO markers. The earlier count matched a reference to `TODO.md` and currency codes in the vendored engine bundle. The 50 in `engine-java/src` are all upstream OpenRocket's own and are left as-is, so the extracted code stays comparable with upstream.
- The big stateful files (`fileSlice.ts`, `workspaceStore.ts`) are where race and ordering bugs would hide. The generation counters and claim tokens help, but these files would gain the most from being split. `store.ts` has been split (see Structure).

## Recommendations

In priority order:

1. ~~Split `store.ts` into more slices: simulations, flight configs, and sweeps/motor guide.~~ Done 2026-11-03.
2. ~~Break up `LaunchPanel.tsx` into smaller sections (wind, rod, site, atmosphere).~~ Done 2026-11-03: one component per card (`LaunchRodSection`, `LaunchSiteSection`, `AtmosphereSection`, `WindSection`, `EarthModelSection`), `QNum` in its own file, and `LaunchPanel.tsx` down from 728 to 111 lines.
3. ~~Split `flightPathExport.ts` into smaller modules.~~ Done 2026-11-03: the parts live in `services/exports/flightPath/` (`options`, `colors`, `model`, `buildModel`, `formats`, `userTemplate`), and `flightPathExport.ts` is a 55-line entry point that re-exports the same public names. `buildBranch`, once a 230-line function, is now a short assembly of named steps (samples, range, landing, event and peak waypoints, track points), checked byte-for-byte against the previous output.
4. ~~Check the `eslint-disable` comments and TODO markers from time to time and remove the ones that no longer apply.~~ Done 2026-11-03; see Robustness. Worth repeating now and then: `npx eslint src --report-unused-disable-directives-severity error` catches a stale disable.
