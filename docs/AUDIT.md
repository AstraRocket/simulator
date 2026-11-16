# AUDIT - `web/` engineering audit (AstraRocket)

<!-- cspell:ignore Strg kal кал baselined unflips reflips draglookup stabilitylookup stabilitylookupcsv Unmarshal -->

Date: 2026-11-13. Branch `dev` at 228b0a2. Run per `docs/AUDIT_PROMPT.md`: eight parallel review agents, one per slice (1, 2, 3a, 3b, 4, 4b, 5, 6), then an independent verification pass over every MED claim, merged here. The duplication audit (`docs/AUDIT_DUPLICATION.md`) and the engine audit (`docs/AUDIT_ENGINE.md`) ran at the same time and are reported there; the defects they found that a user sees are listed under "Found by the sibling audits", under their own IDs and outside the counts below.

Paths and line numbers are as of 228b0a2. If one does not match, search for the quoted expression.

## How to read this

- **VERIFIED** means the cited lines were read and the claim confirmed (against the Java, for a port). For every MED finding that confirmation was done a second time by the coordinator, independently of the agent that raised it. **REPORTED** means an agent raised it with citations and it is plausible, but it was not confirmed that way.
- Severity follows the reporting bar in `docs/AUDIT_PROMPT.md`. LOW is reported only for security and correctness, and for gate gaps in the same form the previous run used.
- Upkeep is listed after the defects and is not counted in them.

## Status

| Category                       | HIGH  | MED   | LOW    | Total  |
| ------------------------------ | ----- | ----- | ------ | ------ |
| 🔴 Security                    | 0     | 0     | 0      | 0      |
| 🟠 Architecture and tooling    | 0     | 0     | 4      | 4      |
| 🟡 Correctness, tests and a11y | 0     | 4     | 16     | 20     |
| 🟢 Dead code                   | 0     | 0     | 1      | 1      |
| **Total**                      | **0** | **4** | **21** | **25** |

No HIGH finding and no security finding this run.

## Previous run (F1 to F52 at 906513c)

| Status                                         | Old IDs                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed, and the fix holds                       | F1, F3, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16, F18, F19, F20, F21, F22, F23, F24, F25, F27, F28, F29, F30, F31, F32, F33, F34, F35, F36, F37, F38, F39, F40, F42, F44, F47, F48, F49, F50, F51, F52 |
| Kept as recorded decisions, reasons still hold | F26 (Scale), F45 (24 stand-in materials; the same 24 rows still resolve to density 0)                                                                                                                               |
| Fixed on the cited path, same defect elsewhere | F17 (now F15), F41 (now F16), F43 (now F17)                                                                                                                                                                         |
| Still open                                     | F4 (now F1: the motor digest `KNOWN` entry still absorbs an embedded motor), F46 (now F24)                                                                                                                          |
| Fixed, but no gate holds it any more           | F11 (the `fields` step no longer compares the stage figures; see F2), F51 (`fields` compares no shear modulus; see "What the desktop steps do not compare")                                                         |

All upkeep items of the previous run are resolved, except the `docs/CODE_QUALITY.md` figures, which are stale again (see upkeep).

## Gates run

| Gate                                                      | Result                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run audit` in `web/`                                 | **Not run in this pass; pending the user's run.** Its steps (format, spell, knip, dupes, coverage, repo checks, `samples`, `desktop`, `fields`, `helpers`) were audited by reading `scripts/audit.mjs` and `scripts/lib/checkSteps.mjs`.                                                                                                                                  |
| `npm run audit` in `engine-java/`                         | **Not run in this pass; pending the user's run.** Its steps (`parity`, `committed`, `extract --check`, `date`, both scorecards) were read, not run.                                                                                                                                                                                                                       |
| `npm run knip` in `web/`                                  | Clean. A separate AST import-graph scan found the two test-only exports in F25 and nothing else beyond the 20 baselined test seams.                                                                                                                                                                                                                                       |
| `npm run metrics` in `web/`                               | 7188 functions; 4 over 200 lines and 11 over complexity 30, each with a disable whose reason holds. `docs/CODE_QUALITY.md` figures are stale (upkeep).                                                                                                                                                                                                                    |
| ESLint rule planting                                      | One file planted in each config block (components, services, tree, prefs, state, a component import cycle, tests, e2e, scripts), linted alone and deleted in the same command. Every rule fired: size and complexity limits, the non-null ban, the layer import bans, `jsx-a11y-x`, Vitest and Playwright rules, floating promises, unused disables.                      |
| Targeted Vitest                                           | `orkExport`, `orkArchive`, `designFile`, `motorDigest`, `rktExport` (171 tests); `geometryFlags`, `Rocket3D` (564 tests); `lintScope`, `noEmDash`, `commentsStateTheConstraint`, `srcExportReach` with `REPO_CHECKS=1` (26 tests). All pass.                                                                                                                              |
| Playwright, coverage, `check:fields`, `check:ork`, builds | Not run. The axe scan list was audited by reading.                                                                                                                                                                                                                                                                                                                        |
| Published catalogs                                        | Fetched from the `data` branch (head 43ad288) and through jsDelivr (byte-identical). Components: 5228 rows, every one digested, no shared digest, same rows and order as the committed copy (only `generated` differs). Motors: 1156 rows, 1068 with digests, 2 rows differ from the committed copy in curves only. Manifest hashes match every file; all files minified. |

**`KNOWN` lists.** `fieldReadback.kernel.test.ts`, `geometryParity.kernel.test.ts`, `geometryParityEdges.kernel.test.ts` and `geometryFlags.test.ts` have empty `KNOWN` lists. No entry in `web/scripts/check-desktop-fields.mjs` or in the `desktop` step's loader-warning list (`web/scripts/check-ork-opens.mjs`) cites a finding ID: each states its reason in words (a RockSim format limit or a desktop reader limit), and those reasons were checked against desktop's handlers and hold. So no citation was rewritten this run. Four entries in `check-desktop-fields.mjs` are wider than their reasons (F1, F2).

---

## 🔴 Security

No security finding. Every user-file reader caps its size before decoding; the import caps (`importLimits.ts`, including the instance product of the previous F1) hold; the CSV, KML, GPX, DXF, 3MF and SVG writers neutralize or escape file-sourced text; remote fetches have timeouts, byte caps and shape checks; there is no `dangerouslySetInnerHTML` (`richText` whitelists three tags); every `target="_blank"` carries `rel="noreferrer"`.

## 🟠 Architecture and tooling

### F1 | LOW | The motor digest `KNOWN` entry still absorbs an embedded motor's digest | VERIFIED

`web/scripts/check-desktop-fields.mjs:205-209` (`rule: 'ork:config.motor.digest'`, `when: (a) => !CATALOG_DIGESTS.has(a)`). The previous F4. Every imported motor is saved with an app-computed digest (`services/motors/exportMotors.ts` `fillMotorDigests`, `ork/embeddedMotors.ts` `rowsDigest`), and none of those is in the catalog, so the entry would accept any difference desktop reads on one. No sample carries an embedded motor (`orkDesktopSamples.test.ts` builds none), so the step never sees the case at all.
**Why it matters:** if the writer's digest ever differs from desktop's, desktop refuses the embedded curve and can fly a same-named database motor while `fields` passes.
**Fix:** `when: (a, d, af) => !af.embedded && !CATALOG_DIGESTS.has(a)` (the app view already records `embedded: true`), and a sample with an imported `.rse` motor.

### F2 | LOW | Three more `KNOWN` entries accept more than their reasons name | VERIFIED

`web/scripts/check-desktop-fields.mjs`:

- `rkt:stage.*` (`:63-72`, `when: (a, d, af, df) => af.cgOverridden !== true && df.cgOverridden === true` and its mass twin) accepts any value desktop reads where the app set no override, so the stage mass and stack CG the writer puts there (`rktExport.ts` `writeStageOverrides`) are never compared. That is the value the previous F11 got wrong; only `rktStageStacks.kernel.test.ts` holds it now.
- `rkt:freeformfinset.planformArea` (`:129-133`) never checks the tapered parent its reason names.
- `rkt:shockcord.radius` (`:240-244`, `d > 0`) never checks the parent's bore its reason names.
  **Fix:** write the stage figures into the samples' JSON and require `d` to equal them; add the parent conditions to the other two.

### F3 | LOW | The export-reach gate counts any identifier of the same name as a use | VERIFIED

`web/tests/repo/srcExportReach.test.ts:99` (`occurrences(code(f), name) > 0 && importsFrom(f, self)`) and `:113`. A prop or local named like the export counts, and `importsFrom` reads raw text, so the defining module counts as reaching itself through a type-only import. Two test-only exports pass today (F25). Run green this pass with `REPO_CHECKS=1`.
**Fix:** resolve uses through import declarations (named specifiers to the declaring file, type-only imports and the defining module ignored).

### F4 | LOW | The mechanical geometry checks miss readers and cases | VERIFIED (tables and generators read)

- `web/tests/tree/geometryFlags.test.ts:532` `FIN_READERS` lacks two fin-flag readers with no `FIN_UNAFFECTED` entry: the fin marking guide (`services/report/markingGuide.ts:128`, `finCant(fin) !== 0 || bool(tube, 'filled')`, and `:148`) and the fin position table (`services/report/reportModel.ts:351`, `cantFrontShift`).
- No reader holds the 3D tube fin wall (F21).
- `geometryParity.kernel.test.ts:82` never generates a shape parameter outside its range, a freeform outline whose last x is at or before its first (F13), a planar fin `rotation`, an internal part inside a filled nose cone, transition or tube, a disc or packed part inside a coupler or inner tube, a disc inside a mass component, or a ring with a fixed outer radius and an automatic bore (outside one hand-built chain).
- `fieldReadback.kernel.test.ts` `SEEDS` has no flipped nose cone and no filled part, so the bridge's flipped-shoulder ordering (`ComponentFactory.java` `settleFlippedShoulders`) is never compared.
- `catalogPatch.kernel.test.ts` never picks onto an inner tube (body tube rows go through `statedPatch`'s body tube branch), a flipped nose cone (`NoseCone.loadFromPreset` unflips, applies, reflips), or a non-default probe (`hollowWall`, `ringPatch`'s kept-bore branch, a transition with a shoulder thickness).
  **Why it matters:** each path can drift from the kernel with every gate green.
  **Fix:** add each reader, case and seed, or list it as unaffected with its reason.

## 🟡 Correctness, tests and a11y

### F5 | MED | The launch documents count the motors and recovery gear of a grounded booster | VERIFIED

`web/src/services/flight/launchDocs.ts:79-81, :88, :97, :108-109`. `flying` drops only grounded top-level stages (`stageNodes` returns `type === 'stage'` only, `tree/treeWalk.ts:108-110`); `collectNodes([stage], (n) => n.motorMount === true)` then walks into a grounded `parallelstage` and lists its mounts. `seatedMotors` (`powerClass.ts:39-41`) skips that booster, so `copies.get(mount.id) ?? 1` gives each of its mounts a count of 1 whatever the booster's instance count. The device walk lists its recovery devices too. Boosters can be grounded: `setStageFlies` (`state/configSlice.ts`) accepts them and `SeparationSection` offers them.
**Why it matters:** the printed flight card states a total impulse, impulse class and certification level that include a motor left on the pad, and lists recovery gear that does not fly. Same class of error as the previous F9.
**Fix:** build the motor rows from `seatedMotors(tree, config)` (which skips grounded stages of both kinds and carries `mountId`), and skip grounded `parallelstage` subtrees in the device walk. Test: ground a 2-instance booster holding one motor; installed impulse equals the sustainer motor's curve impulse and the booster's chute is not listed.

### F6 | MED | A fin stock picked for one design's flutter readout carries over to the next design | VERIFIED

`web/src/state/finFlutterChoices.ts:26` (`let chosen: FinStockChoices = new Map();`), `:29-38`. Choices are held per node id for the page session; `forgetFinStockChoices` is called only by a test (baselined in `srcExportReach`), and `replaceWorkspace` (`state/store.ts`, which resets `hiddenParts`) never clears them. Every design started from the default rocket shares its ids (`services/design/defaultRocket.ts:187`, `id: 'fins'`), and `finStockChoice` puts a held choice ahead of the material match.
**Why it matters:** pick balsa for design A's fins, then open or create design B with G10 fins: B's flutter readout (`FinFlutterReadout.tsx`) and the Results flutter findings (`useFlutterFindings.ts`) use balsa's shear modulus. A safety readout shows the wrong flutter speed and margin for a stock the user never picked.
**Fix:** clear the choices in `replaceWorkspace`, or key each by node id and the material it was picked against. Test: choose a stock, reset the workspace, and `finStockChoice` follows the material again.

### F7 | MED | A desktop `.ork` that flies a drag or stability lookup table opens with Barrowman drag and no note | VERIFIED

`web/src/services/files/ork/passthrough.ts:145` (`KNOWN_CONDITIONS_TAGS` has no `draglookup`, `stabilitylookup`, `draglookupcsv` or `stabilitylookupcsv`) with `ork/importSimulations.ts:36-39`. Desktop at the pinned commit reads these (`SimulationConditionsHandler.java:52-57, :216-240`); the kernel leaves them out (`engine-java/src/java/info/openrocket/core/simulation/SimulationOptions.java:113, :813`, "always the analytic Barrowman calculator"). The importer only carries the element through as raw XML; en.json has no import note for it, and `wireLoadedOrk.ts:55` files desktop's flight summary as current for that simulation.
**Why it matters:** the user sees desktop's lookup-table figures as the app's own; a rerun gives a different apogee and speed with no explanation.
**Fix:** a keyed import note when a simulation's conditions hold any of the four elements, and that simulation's summary filed as outdated.

### F8 | MED | The saved-part editor offers Auto switches that do nothing | VERIFIED

`web/src/components/design/SavedPartEditor.tsx:81` (`<FieldRow key={f.key} node={node} field={f} onChange={change} />`) renders each radius with its Auto switch (`DimensionFields.tsx`). `updateCustomPart` (`services/parts/customParts.ts:226`) stores the flag as ticked, and the editor reopens with Auto on and the box disabled; applying the part runs `pinSavedSize` (`treeEdit.ts:448`), which turns the flag off again, so the part goes on at its stored diameter.
**Why it matters:** an inert control: the editor says the saved part follows its neighbor, and it never does.
**Fix:** leave out the Auto switch for the radii in `STATED_RADII` inside the editor, and pin in `updateCustomPart` too. Test: the editor on a saved body tube shows no Auto switch on its diameter.

### F9 | LOW | WGS gravity and a missing humidity are saved as no element, so desktop takes its user's preferences | VERIFIED

`web/src/services/files/ork/exportSimulation.ts:103-108` (`if (launch.gravityModel === 'constant')`) and `:156` (`if (launch.relativeHumidity != null)`). Desktop always writes `<gravity model="wgs"/>` and `baserelativehumidity` (`OpenRocketSaver.java`); when they are missing, `new SimulationOptions()` takes the gravity model, constant and humidity from the desktop user's preferences (`SimulationOptions.java:88, :103-104`). `check:fields` runs with default preferences, so it cannot see this. **Fix:** always write both.

### F10 | LOW | A fairing is saved to `.ork` as an element desktop drops, with no note | VERIFIED

`web/src/services/files/ork/exportWriters.ts:252` (`header(w, d, node, 'Camera shroud')`, `writeFairing`). Desktop's `ComponentHandler.java:38` ignores the unknown element and its mass; the `.rkt` writer lists it as skipped, the `.ork` writer says nothing. No sample builds a fairing. **Fix:** name it in the save result as `exportRkt` does, or write it as the mass component the bridge flies (`ComponentFactory.java:600-608`).

### F11 | LOW | Unnamed pod sets and boosters are saved under names desktop never gives | VERIFIED

`web/src/services/files/desktopPartNames.ts:23-24` (`podset: 'Pod set'`, `parallelstage: 'Booster'`). Desktop's are "Pod Set" and "Booster Set" (`messages.properties:2692, :2694`; `RocketComponent.java:202` `name = getComponentName()`). `fields` compares no part names. **Fix:** desktop's two names.

### F12 | LOW | `.ork` number readers accept hex, binary and octal | VERIFIED

`web/src/services/files/ork/importTags.ts:28` (`Number(t.split(/\s+/).pop())`), also `orkImport.ts:33`, `importTags.ts:388` and `docMaterials.ts:20, :26`. "0x10", "0b1" and "0o7" are read as numbers; Java's `parseDouble` refuses them. Crafted file only. **Fix:** read the token through `readDecimal`.

### F13 | LOW | A freeform outline whose last x is at or before its first is placed and drawn with a 50 mm root | REPORTED (not built in the kernel)

`web/src/tree/position.ts:24` (`return root > 0 ? root : fallback;`). The kernel flies `last.x - first.x` as stored (`FreeformFinSet.java:458-460`); the bridge checks only the point count and self-crossing, and `useFreeformEditing.ts:50` clamps the last x only to `>= 0`, so a drag reaches it. Length, root chord, station, tab and drawings then use 50 mm. **Fix:** refuse `root <= 0` in the pre-run check beside the 3-point rule, and add the case to `geometryParity`.

### F14 | LOW | "Launch into wind" with an AGL wind profile aims the rod at a different wind than desktop | VERIFIED (against the Java)

`web/src/services/flight/simulations.ts:241-243` with `windLevels.ts:72` (`h = launch.windAltitudeReference === 'agl' ? 0 : ...`). Desktop's `SimulationOptions.getLaunchRodDirection` (`SimulationOptions.java:158-168`) reads the levels at the site's elevation whatever the reference. At an elevated site the app and desktop fly the same `.ork` with different rod headings. The comment at `:241` says the app does what desktop does. **Fix:** follow desktop, or record the choice in `docs/CODE_QUALITY.md` and fix the comment.

### F15 | LOW | A 0 speed warning typed in a simulation is accepted, then replaced by the default | VERIFIED

`web/src/components/sim/SimEditor.tsx:293` (`min={0}`). The previous F17 fixed only Settings (`SettingsTabs.tsx` `MIN_SPEED_LIMIT`); a 0 here flies as `recoverySpeedWarn: 0`, and "Save as default" copies it into settings, where the next load puts back the default (`settings.ts` `pos`). **Fix:** one shared floor for both row sets.

### F16 | LOW | The Benchtop "why Run is disabled" region still remounts with its text | VERIFIED

`web/src/components/tools/SimpleResults.tsx:24` returns a bare `<p role="status">` when empty and a `Notice` at `:26` otherwise, so React replaces the element and the first problem is never announced. Half of the previous F41. `SimpleRocketTool.test.tsx` checks only `textContent`. **Fix:** one always-mounted element whose children change; a test that the status node is the same element before and after.

### F17 | LOW | The cut, copy, paste and duplicate tooltips hard-code "Ctrl" | VERIFIED

`web/src/components/design/useTreeEdit.ts:46, :60, :73, :86` (`named('tree.cut', 'Ctrl+X')` and the rest). Wrong on macOS and German keyboards; the previous F43 fixed only undo and redo. **Fix:** keyed shortcut text with the Apple glyphs by platform, as `UndoRedoButtons` does.

### F18 | LOW | The save status region never speaks | VERIFIED

`web/src/components/layout/SaveStatus.tsx:23, :29`. The region mounts at the first autosave already holding its text, and that text never changes, so by the app's own rule (`StatusLine.tsx`) it is never announced. **Fix:** mount it empty from boot and fill it on save, or drop `role="status"`.

### F19 | LOW | Reset settings, and a refused earlier change comes back on the next change | VERIFIED

`web/src/state/SettingsProvider.tsx:60-64` (`reset`) never clears `unsaved.current`, which `:42` lays over every later save. Needs storage to have refused a write first. **Fix:** `unsaved.current = {}` in `reset`.

### F20 | LOW | "Degraded storage" can overwrite "the saved design could not be opened" | REPORTED (ordering reasoned, not run)

`web/src/state/store.ts:252-254` puts both notices in the one `standing` slot; `useWorkspaceEffects.ts:108-115, :146-153`. An IndexedDB read error both marks storage degraded and rejects the load (`idbKeyValueStore.ts:199-203`); on a cold non-English load both wait on `languageReady()`, and the degraded notice lands second. The user sees the default rocket with a banner about a storage limit. **Fix:** never let `degraded` replace `loadFailed`.

### F21 | LOW | The 3D view draws a tube fin's wall clamped to 45% of its radius | VERIFIED (against the Java)

`web/src/components/canvas/rocketPieces.ts:306-309` (`Math.min(num(child, 'thickness', 0.0005), rt * 0.45)`, `Math.max(rt - wall, rt * 0.55)`). The kernel flies the stated wall clamped only to the outer radius (`TubeFinSet.java:166, :201`), and a keyless wall from the parent tube (`BodyTube.java:586-590`), not 0.5 mm. Drawing only. **Fix:** draw the kernel's wall and bore; a tube fin wall reader in `geometryFlags`.

### F22 | LOW | The Aero table's whole-rocket share prints "100%" in every locale | VERIFIED

`web/src/components/canvas/AeroComponentTables.tsx:126` (`<td className={CELL}>100%</td>`); every other row uses `fmtPercent`, so German and French read "12 %" above "100%". **Fix:** `fmtPercent(100)`.

### F23 | LOW | The parts sync reads a material's density without its unit | VERIFIED (0 rows today)

`web/scripts/sync-components.mjs:72` (`Number(b.match(/<Density>([^<]*)<\/Density>/)?.[1])`) ignores `<Material UnitsOfMeasure="...">`; desktop converts (`MaterialDTO.afterUnmarshal`, `MaterialDTO.java:134-146`). Two pinned database files declare `g/m2`; every part using them today takes its material from `PresetDump`, so no published row is wrong. A new part there would publish a density 1000 times off with a green run. **Fix:** apply the unit factor or refuse an unmapped unit.

### F24 | LOW | Two presets that tie on every matched field would get their digests by row order | REPORTED (no instance)

`web/scripts/sync-preset-digests.mjs:132-145` (`presetFor`). The previous F46, still open by plan. Three key and description pairs share type, maker, part number and description today; each differs in size, so none ties. **Fix:** as before, when the preset data next changes.

## 🟢 Dead code

### F25 | LOW | `isFirstStage` and the store's `selectRunIds` re-export are used only by tests | VERIFIED

`web/src/services/design/treeEdit.ts:786` (`export function isFirstStage`) is imported only by `tests/services/design/treeEdit.test.ts`; `useSelectedComponent.ts:39` repeats it inline (`stages[0]?.id === node.id`). `web/src/state/store.ts:34` re-exports `selectRunIds`, which only `tests/state/store.test.ts` imports through the store. Both pass the export-reach gate (F3). **Fix:** call `isFirstStage` from `useSelectedComponent` (or delete it), and drop `selectRunIds` from the re-export.

---

## Found by the sibling audits

Defects a user sees that `docs/AUDIT_DUPLICATION.md` (D ids) and `docs/AUDIT_ENGINE.md` (E ids) report. Details, citations and fixes are there; they are not counted in this report's totals. Severities are each report's own (the duplication audit rates any user-visible drift HIGH).

| ID  | Severity | What the user sees                                                                                                                                         |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E31 | MED      | A crafted 30 KB `.ork` (pod sets chaining automatic radii) freezes the tab for about a minute on import and again on every edit.                           |
| E1  | MED      | The opt-in "rail needed" figure is too short when the rod is shorter than the guide-to-aft distance.                                                       |
| D2  | HIGH     | Same defect as F5 (grounded booster in the launch documents); one fix closes both.                                                                         |
| D1  | HIGH     | The 3D HUD, the Altitude chart panel, the printed flight card and the motor guide table show flight figures in the global unit, not the scoped chip units. |
| D3  | HIGH     | The picker's inline "new library material" form silently replaces a same-named material; My Materials refuses the same save.                               |
| D4  | HIGH     | The KML, GPX and CSV path export puts the pad at latitude 0 when only latitude is cleared; the kernel and the `.ork` writer use 28.61.                     |
| D5  | HIGH     | The aft view draws one centered bore on an automatic ring around a motor cluster; the 3D view and every export cut one hole per tube.                      |
| D6  | HIGH     | The Bore field reads raw keys beside fields that show kernel defaults; typing a bore can write `thickness: 0` (reachable from a `.rkt` with no `ID`).      |
| D7  | HIGH     | The motor card treats a damaged embedded motor as having a curve while Run refuses it.                                                                     |
| D8  | HIGH     | Calibers print "kal." and "kal" (pl), "кал." and "кал" (ru) on different screens.                                                                          |
| D11 | MED      | A missing ground position draws the 3D path to the pad in two readers and skips it in two others.                                                          |
| E32 | LOW      | An `.ork` with large unknown elements fails to open with the kernel's size message.                                                                        |
| E2  | LOW      | Constant gravity is 9.80665 where desktop uses 9.807.                                                                                                      |

---

## What the desktop steps do not compare

Read from `check-desktop-fields.mjs`, `ork-check/OrkFields.java`, `check-ork-opens.mjs` and `orkDesktopSamples.test.ts`; not run this pass.

- A key missing on the desktop side is skipped, and `ComponentFields` has no key for: part names (F11), shear modulus and material group (the previous F51), appearance, color and inside appearance, line style, the preset link (part number, digest) and the document materials.
- The rocket itself is skipped (`OrkFields.java:75`): designer, comment, revision, kit name, design type, reference type and custom reference.
- Simulations: base humidity (F9), stepper, random seed, the four speed warnings, forecast levels and the flight summary.
- The sample generator builds no fairing (F10), no embedded motor (F1) and no app-extension element (airfoil diamond and leading edge radius, spill hole, `caseairframe`, `nozzleexitdiameter`, `maxmotorlength`), so the `desktop` step never sees the warnings those raise.

## Upkeep

Not counted above. Grouped by rule.

**A comment, doc or test title that states something untrue or out of date**

- `docs/CODE_QUALITY.md`: stale against `npm run metrics`: `:42` 7,169 functions (7,188), 108 over 100 lines (105); `:43` and `:134` 120 over complexity 15 (112); `:44` and `:144` 152 catch blocks (147); `:66-68` `defaultNode` 224 (222), `TreeSchematic` 231 (213), `createPainter` 206 (205); `:134` `writeCommon` 42 (43), `rowGeometry` 36 (37); `:119` "2 components over 500 lines" (0); `:161` 408 `arr[i]!` (429, as `:45` says); `:166-167` 36 disables, 19 `jsx-a11y`, 21 non-size (33, 16, 18); `:149` 648 test files and 8 repo checks against `:39` (651, 9 files); `:152` "All 368 values" against `engine-java/audit.mjs:58` `--expect-lines 367`.
- `docs/DEVELOPER.md:88`: "an exported function or constant used only in its own file is still reported" by knip; `CAPABILITIES` (`services/app/capabilities.ts:13`) is exactly that and knip is clean (its `keyof typeof` use in the same file counts).
- `docs/ARCHITECTURE.md:195`: every RockSim `CantAngle` converted from degrees "at all six sites"; the code keeps it in radians both ways (`rktImport.ts:389`, `rktExport.ts:214`).
- `.github/workflows/sync-catalogs.yml:3-4`: "components from the OpenRocket-Components database"; the source is `openrocket/openrocket-database` at the build's submodule pin plus the build's `internal` files.
- `web/scripts/check-offline-data.mjs:26`, `check-update-flow.mjs:17`, `check-offline-help.mjs:280`: "Must match services/storage/settings.ts" now sits above unrelated constants; the constant moved to `scripts/lib/previewCheck.mjs:8` (`SETTINGS_KEY`), which has no such note.
- `web/src/services/flight/simulations.ts:241`: "as SimulationOptions.getLaunchRodDirection does" (F14).
- `web/src/services/design/finTabAuto.ts:27`: "Deliberately differs from desktop" (cluster and offset mounts), not listed in `docs/CODE_QUALITY.md`'s "Where the app differs from desktop on purpose".
- `web/src/components/tools/SimpleResults.tsx:23`: "Always mounted, swapping its text" (F16).
- `web/src/components/canvas/schematicParts.tsx:352`: "its 85% cap"; `internalExtent` (`tree/schematicGeometry.ts:241-247`) has no such cap.
- `web/src/components/canvas/ChartPanelFrame.tsx:47`: `/** Goes in <defs>. */` sits above `PanelReading`; it describes `PanelClip` (`:58`).
- `web/src/tree/nodeProps.ts:5`: the "Rejects non-finite values" JSDoc sits above `innerTubeRadius`; it describes `num`/`numOpt` (`:10-14`).
- `web/src/state/simSlice.ts:79`: "Names are never reused, even after deletions"; `uniqueSimName` starts at `s.sims.length + 1` (`:141`), so deleting the last one reuses its name.
- `web/src/state/editSlice.ts:167`: "OK on an unedited dialog records nothing"; no dialog with an OK button calls `updateDesignMeta`.
- `web/tests/tree/podLayout.kernel.test.ts:61`: the test title cites a duplication audit ID ("(D58)"). The comment-history gate's patterns (`commentsStateTheConstraint.test.ts:11-13`) need the word "audit" or "finding" beside the ID, so a bare parenthesized ID passes: a gap in the gate. The gate also does not read `push/version/pushversion.{sh,bat}`, `engine-java/build-engine.bat`, `gradlew.bat`, `gradle.properties`, `.gitignore` or `.gitattributes` (no history found in them today).

**A duplicated helper, formula or list that has drifted**

- The speed warning rows: `layout/SettingsTabs.tsx` (`MIN_SPEED_LIMIT`) against `sim/SimEditor.tsx` (`min={0}`) (F15).
- Shortcut text: `design/useTreeEdit.ts` against `layout/UndoRedoButtons.tsx` (F17).
- Shear modulus entry: `tools/FlutterFields.tsx` (`kind="pressure"`) against `design/ShearModulusInput.tsx` (the `shearModulus` quantity, GPa or ksi): one property typed in two units. No number is wrong today.
- `web/tests/services/files/orkDesktopSamples.test.ts:164-165`: `l.latitudeDeg ?? 0`, `l.longitudeDeg ?? -80.6` against the writer's `KERNEL_LAUNCH_SITE`; a sample with a cleared site would report a false difference.
- The first-stage test in `useSelectedComponent.ts:39` against `treeEdit.isFirstStage` (F25).

**User docs that state something the app does not do:** `docs/ARCHITECTURE.md:195` above; none found in the user docs the slices read.

## Not checked

- `npm run audit` (web and engine), coverage, `check:fields`, `check:ork`, Playwright (axe included) and every build: not run, pending the user's run.
- Desktop's Swing sources are not in `engine-java/.openrocket-src` (core only), so `FinSetConfig.calculateAutoTab`, `ComponentPresetChooserDialog`'s filter tolerance, `ParachuteConfig`'s lower-stage rule, `CustomFinImporter` and desktop's UI naming were not compared.
- `PresetDump`, `MotorDump` and the sync scripts were not run; the per-type preset counts are inferred from the scripts' write-time refusals. For parts with no stated mass the app's density was not compared with desktop's.
- Slice 1 read about 89 files in full and skimmed the rest (the Onshape and RASAero writers, `rocksim/schema.ts`, the rest of `exports/`, `report/` and `app/`) by grep for escaping only.
- Memoization and re-render cost were not profiled.

## Recommended order of attack

1. **Small verified fixes with a clear expected value.** F6 (clear the stock choices in `replaceWorkspace`), F5 (motor rows from `seatedMotors`, skip grounded boosters), F8 (no Auto switch in the saved-part editor), F11, F15, F16, F17, F18, F19, F22. Each is a few lines; take the expected values from the kernel, desktop's resources or the locale files.
2. **F7 (lookup-table simulations).** A keyed import note and an outdated summary.
3. **Files desktop reads differently: F9, F10, F12,** each checked through `check:fields` or `check:ork`.
4. **Gate gaps: F1 and F2** (narrow the `KNOWN` entries and add the embedded-motor and stage-figure samples), **F3 with F25**, then **F4** (the missing readers, generator cases and seeds), adding **F13 and F21** with their cases.
5. **F14** (follow desktop or record the choice), **F20**, **F23**.
6. **Upkeep,** with the `docs/CODE_QUALITY.md` figures refreshed from `npm run metrics`. F24 waits for the next preset data change.
