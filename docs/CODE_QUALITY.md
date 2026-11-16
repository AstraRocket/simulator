# Code Quality Assessment

2026-11-05

How the codebase rates on structure, readability and robustness. The assessment is based on layout and metrics across `web/src` (about 75k lines, down from 102k almost entirely through the comment trim), `engine-java`, the lint and tsconfig setup, and CI, plus a sample of the main store, the engine bridge and several components. It is not a line-by-line audit.

## Summary

| Area        | Grade | Earlier grade, on a narrower test |
| ----------- | ----- | --------------------------------- |
| Structure   | A     | A-                                |
| Readability | A-    | A-                                |
| Robustness  | A     | A                                 |

This is a mature, heavily gated codebase. On the wider test that also covers function size, complexity and import direction, Structure is now A and Readability is back at A-. The layers are enforced by lint, there are no runtime import cycles, lint limits function size and complexity, and the 4 functions over 200 lines and 11 over complexity 30 each state why they stay. Robustness holds its grade, and rests on a measured test and coverage run. The full unit and e2e suites pass on the final code.

### How it is graded

The test stays fixed, so a change in grade means the code changed. If the test has to change, say so here and regrade the earlier figures too. The grades are a judgment from these measures and from a sample of the code.

| Area        | Measured by                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Structure   | Layer rules and import cycles, functions over 200 and 400 lines, components over 500 lines, the largest modules              |
| Readability | Functions over complexity 15 and 30, duplication, naming, comments, import block size                                        |
| Robustness  | Tests and coverage against the floors, non-null assertions and casts, catch blocks, lint disables, which checks actually run |

| Grade | Meaning                                                                                      |
| ----- | -------------------------------------------------------------------------------------------- |
| A     | Every check passes, each exception states a reason that holds, and what remains is contained |
| A-    | As A, but one weakness is spread widely through the code                                     |
| B     | A check fails, a rule goes unenforced, or a kind of problem is growing with no reason given  |
| C     | Real defects keep coming from it                                                             |

### Measured 2026-11-11

| Check                                           | Result                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Typecheck, lint, Prettier, jscpd, knip          | All pass, 0 clones                                             |
| Unit tests                                      | 8,286 pass in 651 files, plus 71 repo checks in 9 files        |
| Coverage (2026-11-05, not rerun)                | Lines 91.2%, statements 89.7%, functions 86.1%, branches 82.8% |
| Coverage floors                                 | Lines 89, statements 88, functions 84, branches 80             |
| Functions over 100 / 200 / 400 lines (of 7,169) | 108 / 4 / 1                                                    |
| Functions over complexity 15 / 30 / 50          | 120 / 11 / 1                                                   |
| Catch blocks                                    | 152, of which 15 hold only a comment and none are bare         |
| Non-null assertions                             | 429, all on an index; lint blocks every other kind             |
| `as unknown as` casts                           | 29                                                             |

The function, assertion and cast figures come from `npm run metrics`, counted as ESLint counts them. Complexity there also counts optional chaining and default values, not counting nested functions. The full unit and e2e suites and coverage were rerun on the final code and passed, with coverage above all four raised floors. The refactoring did not touch the engine. The change audit in `AUDIT_PROMPT_CHANGES.md` has not been run on this work.

## Structure: A

### Strengths

- Layers are clean and enforced by lint. `engine/` wraps the TeaVM kernel, `services/` holds domain logic (design, flight, files, motors, storage, weather, exports), `components/` holds UI, and `state/` holds stores. ESLint stops domain code importing from `state/` or `components/`, and `state/` importing from `components/`, including through `import()`. `prefs/useUnits.ts` is the one exception, a hook bound to the settings provider. `import-x/no-cycle` blocks runtime import cycles; type-only imports are allowed because they are erased at build.
- Separate tsconfigs for app, tests, e2e and node, each with a clear scope.
- The vendored OpenRocket Java is kept apart in `engine-java/`, with its own patches, reference data and validation folders.
- CI goes through one place: `.github/workflows/gates.yml` defines the checks and `ci.yml` only calls it.

### Weaknesses

- Four functions are still over 200 lines, each on purpose, with the reason in a comment on the function:

  | Function                         | Lines | Why it stays                                                                                   |
  | -------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
  | `resolveAxial` (`autoRadius.ts`) | 438   | Its helpers share state and must run in the kernel's order, so splitting would hide that order |
  | `defaultNode`                    | 224   | One `switch` that is a table of default values                                                 |
  | `TreeSchematic`                  | 231   | Layout and shared zoom and hover state; its parts already live elsewhere                       |
  | `createPainter`                  | 206   | Small helpers over one config, with no branching to separate                                   |

- The longest component functions were the worst of this. **Resolved 2026-11-05:** each now keeps its layout and hands state and sections to hooks and child components:

  | Function                             | Lines before | Lines now |
  | ------------------------------------ | ------------ | --------- |
  | `buildSchematicShapes`               | 682          | 153       |
  | `SimpleRocketTool`                   | 481          | 76        |
  | `renderChildren`                     | 386          | 31        |
  | `ExportDialog` (`components/report`) | 380          | 47        |
  | `TreeSchematic`                      | 375          | 214       |
  | `FlightPath3D`                       | 333          | 85        |
  | `FlightChart`                        | 331          | 140       |
  | `MotorDialog`                        | 324          | 116       |
  | `WeatherDialog`                      | 274          | 171       |
  | `SimSummary`                         | 210          | 14        |
  | `buildPieces`                        | 333          | 10        |
  | `buildAftScene`                      | 304          | 12        |
  | `ExportDialog` (`FlightPathExport`)  | 298          | 129       |
  | `WindProfileDialog`                  | 298          | 129       |
  | `PickerDialog`                       | 268          | 92        |
  | `MaterialPicker`                     | 250          | 155       |
  | `AeroAnalysis`                       | 247          | 130       |
  | `FreeformFinEditor`                  | 240          | 34        |
  | `PropertyPanel`                      | 238          | 147       |
  | `Rocket3D`                           | 223          | 158       |

- Nothing enforced the layers, three services imported from `state/`, and four runtime import cycles existed, one through `store.ts`. **Resolved 2026-11-04:** `assembleReport` now takes a `ReportSource` built by `state/reportSource.ts`, `downloadReportPdf` is handed its notice, `catalogUpdates.ts` announces through a listener, and the other three cycles were broken by moving one function or removing one import.
- `web/src/state/store.ts` was 2,108 lines with about 63 actions, the obvious god-object risk. **Resolved 2026-11-03:** flight configurations, simulations, batch runs, the drift sweep and the motor guide now live in their own slices, and the store keeps the design tree, undo history and workspace swap (318 lines, with the tree editing actions in `editSlice.ts` since 2026-11-05):

  | File                 | Lines |
  | -------------------- | ----- |
  | `store.ts`           | 318   |
  | `editSlice.ts`       | 172   |
  | `configSlice.ts`     | 246   |
  | `simSlice.ts`        | 200   |
  | `motorGuideSlice.ts` | 182   |
  | `runSlice.ts`        | 158   |
  | `driftSweepSlice.ts` | 150   |
  | `runBasis.ts`        | 52    |
  | `sliceShared.ts`     | 18    |

- No file is over 950 lines now, but that mostly reflects the comment trim. These modules hold about as much code as before:

  | File                            | Lines |
  | ------------------------------- | ----- |
  | `services/files/rktImport.ts`   | 844   |
  | `engine/openRocketEngine.ts`    | 840   |
  | `services/design/treeEdit.ts`   | 807   |
  | `services/design/autoRadius.ts` | 735   |

- 2 components are over 500 lines, down from 13, mostly through the trim and then the function splits. `components/sim/LaunchPanel.tsx` had about 40 imports, a sign it did too many jobs. **Resolved 2026-11-03:** it is now a 66-line shell over one component per card.

## Readability: A-

### Strengths

- Comments explain _why_: invariants, units, ordering constraints, platform quirks and desktop parity. The `openRocketEngine.ts` header (SI units, which fields are in degrees, why import order matters) is a good example.
- Names are descriptive and consistent (`selectOutdated`, `withKernelEnds`, `reconcileConfigs`).
- Prettier and jscpd (duplicate detection, threshold 0) run in `npm run check` and block every pull request.

### Weaknesses

- The comments were sometimes long enough to be hard to read. **Resolved 2026-11-03:** every hand-written source file (web, website and the engine-java bridge, shims and tooling) was trimmed to one-line comments that prevent a bug or a wrong fix: traps, platform quirks, units, desktop parity rules and license and terms-of-use notes. Comment lines went from about 52,000 to 4,850, with a check that nothing but comments changed. The strict pass had no reviewers, and some useful explanations went with it: the `e2e/base.ts` retry reason and the parity limit reasoning have already been restored, so others may turn up.
- jscpd reported 4 clones against its threshold of 0, so the check failed. **Resolved 2026-11-04:** it now finds none. Shared pieces replaced the copies: `SchematicDefs`, `ReadoutOpener`, `StepperOptions` and a `DeviceSelect` inside `StageRecovery.tsx`.
- Large import blocks and big files make it slow to get your bearings. This ties back to the structure weaknesses. `MotorGuideDialog.tsx` has the most, at 35 imports.
- 11 functions are over complexity 30, and each states why it stays. Most are flat lists: `isComponentRow` (55), `paramsOf` (44), `writeCommon` (42), `rowGeometry` (36), the launch defaults cleanup in `settings.ts` (34), `importOrk` (33) and `filterMotors` (31). The others keep related steps or rows together: `loadOrk` (36), `MaterialPicker` (34), `CardBody` (32) and `shoulderSeed` (32). 120 are over complexity 15, which is why Readability stays at A-.
- The one-line comment rule left some stateful code thinly explained. **Resolved 2026-11-04:** every field in `workspaceStore.ts` now says what it guards.

## Robustness: A

### Strengths

- TypeScript is in its strictest practical mode: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters`. There is essentially one real `any` (a generic constraint in `ErrorBoundary.tsx`) and zero `@ts-ignore`.
- ESLint runs type-checked rules (`no-floating-promises`, `no-unsafe-*`) and React-Compiler hook rules with `--max-warnings 0`.
- Error handling is deliberate:
  - No bare catch blocks. 15 of the 152 drop the error and hold only a comment.
  - Errors are keyed for i18n through `KeyedError`.
  - Async work checks abort signals and "is this result still mine" guards.
  - Simulations run in a worker with timeout and cancel error types.
- Tests are heavy:
  - 648 unit test files (640 plus 8 repo checks), which is more tracked files than `src` has, and about 100k lines of tests against 74k of source.
  - Coverage of 91.2% of lines and 82.8% of branches, with floors in `vitest.config.ts`.
  - Sharded Playwright e2e, plus offline-data and update-flow checks.
  - Differential tests on the Java engine, run by hand. All 368 values match the golden file exactly, and the browser targets stay within the limits on every line (0.5% for flight, 1% in gusty wind).
  - knip for dead code, as a CI gate.
- The engine loader falls back from WASM to JS when the browser lacks support or the load stalls.

### Weaknesses

- The coverage floors sat 8 to 10 points below actual coverage, so coverage could fall a long way before the gate noticed. **Resolved 2026-11-04:** they now sit about 2 points below it. No CI job checks them: `npm run test:coverage` does, by hand, while the work can still change.
- The type-safety figures are less absolute than "one `any`" suggests:
  - All 537 non-null assertions were classified, and about 40 that outside data could plausibly reach (imported files, saved workspaces, weather responses) were traced to their checks. None was a real bug. **Resolved 2026-11-05:** the 127 that were not on an index are gone, narrowed or moved to `must` in `services/app/must.ts`, which fails with a named error. ESLint now rejects any new one in `web/src`, and `lintScope.test.ts` holds the rule to every config block.
  - **Left on purpose:** the 408 `arr[i]!` that remain, in numeric loops and mesh code where `noUncheckedIndexedAccess` has no way to know the bound. A mistake in one crashes or produces `NaN`. All were checked on 2026-11-05, and none was a real bug: a script proved 115 from a bound on the same array, the other 293 were read with the lines before them, and about 25 of those were traced to the code that feeds them. The options below were considered and are not being done:
    - Replacing them with `?? 0`: it turns a visible failure into a wrong number, the worst outcome in a flight simulator.
    - A throwing helper such as `at(arr, i)`: about 110 files would change and hot loops would get slower, for the same failure with a clearer message.
    - Turning on `no-non-null-assertion` everywhere: 408 sites to rewrite or exempt, for the reasons above.
  - Most of the 29 double casts are harmless (`globalThis`, `self`, i18n's `TFunction`). `ComponentNode` itself allows any string key, so a mistyped node field name is still not a compile error. `TODO.md` lists this under Watch, with what would make it worth fixing.
- 36 `eslint-disable` comments and 54 TODO/FIXME markers. 15 of the comments are the size and complexity exceptions above, and lint fails on any that stops being needed. **Checked 2026-11-03:**
  - `eslint --report-unused-disable-directives` finds none unused. Two `react-hooks/exhaustive-deps` disables (`FlightGroundMap.tsx`, `NumberInput.tsx`) were replaced with `useEffectEvent`, leaving 20. All 20 are deliberate and give their reason. 19 are `jsx-a11y` rules: 15 on ARIA patterns the rules do not model (roving tabindex in menus and the tree, focusable chart crosshairs and the site map, the window splitter, dialog backdrop clicks) and 4 where the rule sees only the JSX (link text filled in by `<Trans>`, a scrollable pane that needs a tab stop, an Enter handler catching keys bubbled up from a form). The last is the `any` in `lazyNamed`, which is `React.lazy`'s own constraint. One added since, in `components/common/useFilePick.ts`, states a reason that holds, making 21.
  - `web/src` has no TODO markers. The earlier count matched a reference to `TODO.md` and currency codes in the vendored engine bundle. The 50 in `engine-java/src` are all upstream OpenRocket's own and are left as-is, so the extracted code stays comparable with upstream.
- `services/storage/workspaceStore.ts` (352 lines) is the likeliest home left for race and ordering bugs. `store.ts` and `fileSlice.ts` have been split (see Structure and Recommendations), and the unload journal moved to `workspaceJournal.ts` on 2026-11-04. The rest is one class whose methods all share the same fields (active id, generation, last-seen stamp), so it stays whole on purpose: splitting it would spread that state across files and make the ordering harder to follow. The generation counters and claim tokens are the guard here.
- The repo checks in `npm run audit` failed, and knip reported two unused exports. Both ran only by hand, so they could fail unnoticed. **Resolved 2026-11-04,** and both are now CI gates (the `repo` and `housekeeping` jobs in `gates.yml`):
  - `srcExportReach.test.ts` flagged 18 exports. 11 were deliberate test hooks and joined its baseline. 6 were names `flightPathExport.ts` re-exported for tests alone, and those tests now import from `flightPath/`. `findCatalogMotor` had no production caller and was removed.
  - `scriptsReferenced.test.ts` had two faults in the test itself: it missed sibling imports such as `./rankCurves.mjs`, and it relied on comments the trim removed.
  - knip: the unused `Key` type was deleted, and `DEADLINE_MS` is no longer exported.
- The desktop checks in `npm run audit` compared against the OpenRocket 24.12 release, far behind the commit the engine runs, so most of their expected differences were version noise. **Resolved 2026-11-04:** they now build and compare against the engine's own commit (`npm run openrocket:build`). The catalog's motor and preset digests are still synced from the 24.12 release, so they differ from what the engine's commit computes. Desktop still resolves the same motors by name.
- The e2e suite once passed 596 of 597, failing on a preview-server refusal under load. `openApp` now pauses between retries. **Resolved 2026-11-04:** the full suite passed after that change.

## Where the app differs from desktop on purpose

Each of these is a choice, not a gap. A test or script holds each one, so it cannot change without someone noticing.

### The Scale tool scales more than desktop's

Desktop's Scale (`ScaleDialog`'s scaler table) leaves these at their old size. The app scales them too, because a rocket scaled 2x with its old fillets and tube fins is rarely what anyone wants:

- Every fin set: fillet radius, leading-edge radius, and the airfoil's leading and trailing edge sizes.
- A tube fin set: length, outer radius and wall. Desktop has no scaler for tube fins at all.
- An inner tube: maximum motor length.
- A tube coupler: the stored inner radius. The bridge builds a coupler from its wall, so this only keeps the stored bore in step with the scaled wall.

A design scaled in the app and saved as `.ork` therefore differs from the same design scaled in desktop in these values. `tests/tree/scaleRocket.test.ts` ("the Scale tool's keys") holds the app's keys to desktop's table plus this list, part type by part type.

### Catalog parts with no material weight get a stand-in

24 parts in the parts library desktop ships have a material of density 0, so desktop weighs them at 0 g. The catalog gives each the nearest built-in material instead (`web/scripts/lib/nearestMaterial.mjs`), so a chute or streamer picked from the catalog weighs something. The `.ork` writer writes the stand-in after the preset, so desktop opens the file with the stand-in's weight too.

| Library material           | Stand-in            | Parts                                                                                                                                                  |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rip Stop Nylon             | Ripstop nylon       | SEMROC Astronautics parachutes PN-14, PN-18, PN-24, PN-30, PN-36                                                                                       |
| Polyethylene LDPE          | Polyethylene (thin) | Estes parachutes 302262, 302264, 302267, 302271; SEMROC Astronautics parachutes CP-12, CP-16, CP-20, CP-24, CP-32; Public Missiles streamer PML TBD123 |
| Paper                      | Paper (office)      | SEMROC Astronautics streamers RS-118, RS-124, RS-136, RS-224, RS-236, RSW-36, SM-1A                                                                    |
| Light Ply                  | Plywood (birch)     | FlisKits engine block EB-2.5                                                                                                                           |
| Balsa, bulk, Estes typical | Balsa               | SEMROC nose cone BNC-5NAS                                                                                                                              |

`nearestMaterial` refuses a stand-in that is not a built-in material, so a renamed built-in stops the sync.

## Recommendations

In priority order:

1. ~~Split `store.ts` into more slices: simulations, flight configs, and sweeps/motor guide.~~ Done 2026-11-03.
2. ~~Break up `LaunchPanel.tsx` into smaller sections (wind, rod, site, atmosphere).~~ Done 2026-11-03: one component per card (`LaunchRodSection`, `LaunchSiteSection`, `AtmosphereSection`, `WindSection`, `EarthModelSection`), `QNum` in its own file, and `LaunchPanel.tsx` down from 728 to 66 lines.
3. ~~Split `flightPathExport.ts` into smaller modules.~~ Done 2026-11-03: the parts live in `services/exports/flightPath/` (`options`, `colors`, `model`, `buildModel`, `formats`, `userTemplate`), and `flightPathExport.ts` is a 21-line entry point that re-exports what the app uses. `buildBranch`, once a 230-line function, is now a short assembly of named steps (samples, range, landing, event and peak waypoints, track points), checked byte-for-byte against the previous output.
4. ~~Check the `eslint-disable` comments and TODO markers from time to time and remove the ones that no longer apply.~~ Done 2026-11-03; see Robustness. Worth repeating now and then: `npx eslint src --report-unused-disable-directives-severity error` catches a stale disable.
5. ~~Clear the 4 jscpd clones so the duplicate check passes again.~~ Done 2026-11-04; see Readability.
6. ~~Split `state/fileSlice.ts` (639 lines), the largest stateful file and the likeliest home for race and ordering bugs.~~ Done 2026-11-04: `fileSlice.ts` keeps opening, importing and replacing the workspace (247 lines), `designLibrarySlice.ts` holds the saved designs (140), `exportSlice.ts` holds saving and exporting (240), and `workspaceHandoff.ts` holds the claim tokens and the flush they all share (55). The action bodies moved unchanged.
7. ~~Split the longest component functions: `SimpleRocketTool`, `ExportDialog`, `TreeSchematic` and `FlightPath3D`.~~ Done 2026-11-04: the code moved by line range, and the rendered HTML of all four matched byte for byte across 24 states (every validation notice, a full flight, both report dialogs, rulers and calipers, playback). The 3D scene does not render under jsdom, so that comparison does not cover it. `SimpleRocketTool` had no unit test and now has one.
8. ~~Keep splitting long component functions: `FlightChart`, `MotorDialog`, `WeatherDialog`, `SimSummary`, then `renderChildren`.~~ Done 2026-11-04: the schematic shapes and the `SimSummary` cards matched byte for byte across 23 states, and the other three rely on their own tests. Complexity also came down in `LandingEstimator` (40 to 12), `ComponentTree` (34 to 6), `SiteMap` (32 to 21) and `statedPatch` (37 to 16), checked by their own tests. `App` (36 to 18) matched byte for byte across 18 states with random ids masked; `validateSolid` (38 to 21) and `FieldRow` (31 to 23) rely on their own tests.
9. ~~Remove the imports from `state/` and add an ESLint import boundary and cycle rule.~~ Done 2026-11-04; see Structure.
10. ~~Raise the coverage floors to just under actual: lines 89, statements 88, functions 84, branches 80.~~ Done 2026-11-04.
11. ~~Type the component node field access in `treeEdit.ts`, `repairValues.ts` and `DimensionFields.tsx`, and remove the `LaunchConditions` cast in `SiteFields.tsx`.~~ Done 2026-11-04: the first two casts did nothing, `KERNEL_AUTO_KEYS` is now checked against `ComponentInfo`, and `LocationPicker` asks only for the site fields it reads.
12. ~~Add short comments for the unexplained `workspaceStore.ts` fields.~~ Done 2026-11-04.
13. ~~Split the remaining functions over 200 lines where it helps: `buildPieces`, `buildAftScene`, `ExportDialog` (`FlightPathExport`), `WindProfileDialog`, `PickerDialog`, `MaterialPicker`, `AeroAnalysis`, `FreeformFinEditor`, `PropertyPanel`, `Rocket3D` and the `store.ts` creator.~~ Done 2026-11-05: the code moved by line range. The output of `buildPieces` and `buildAftScene` matched byte for byte across two designs using every part type, with and without motors. The rest rely on their own tests and do not cover the 3D view, which does not render under jsdom. `MaterialPicker` keeps its form values in the parent, so Cancel still keeps a half-typed name and density.
14. ~~Remove the non-null assertions that are not on an index and add a lint rule against new ones.~~ Done 2026-11-05; see Robustness for what stays and why.
15. ~~Limit function size and complexity in lint, keep the measuring script in the repo, hold the guides to the scripts and CI jobs, and write the conventions and the grading rubric down.~~ Done 2026-11-05.
