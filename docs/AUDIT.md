# AUDIT - `web/` engineering audit (AstraRocket)

Date: 2026-10-24. Branch `beta` at fc4dda2. Run per `docs/AUDIT_PROMPT.md`: ten parallel review agents, one per slice (slice 1 split into 1a `services/files` and 1b the rest; slice 3 split into 3a `components/canvas`, 3b `components/{common,config,design,report,tools}` and 3c `components/{layout,sim}`), merged here.

Paths and line numbers are as of fc4dda2. If one does not match, search for the quoted expression.

## How to read this

- **VERIFIED** means the cited lines were read and the claim confirmed. Every MED finding below was re-read against the source (and the Java, for a port) by the coordinator, independently of the agent that raised it. **REPORTED** means an agent raised it with citations and it is plausible, but it was not fully confirmed.
- Severity follows the reporting bar in `docs/AUDIT_PROMPT.md`: HIGH and MED are wrong numbers, lost work, a file desktop reads differently, a control that fails, a security hole, or a gate that passes while its subject is broken. LOW is reported only for security and correctness.
- Upkeep is listed after the defects and is not counted in them.

## Status

| Category                       | HIGH  | MED    | LOW    | Total  |
| ------------------------------ | ----- | ------ | ------ | ------ |
| 🔴 Security                    | 0     | 0      | 0      | 0      |
| 🟠 Architecture and tooling    | 0     | 5      | 3      | 8      |
| 🟡 Correctness, tests and a11y | 0     | 8      | 24     | 32     |
| 🟢 Dead code                   | 0     | 0      | 1      | 1      |
| **Total**                      | **0** | **13** | **28** | **41** |

Open: 2 (F4, F7). Fixed: 39. The unit and kernel tests that pin a fix were run against the unfixed code (a scratch copy of fc4dda2) and failed there. Not checked that way: the repo-gate tests for F3 and F5 and the axe screens for F6 (the scratch copy holds `web/` only), F24, which the desktop `fields` step holds, and the tests that only widen a gate (F38 to F40), which pass on both.

No HIGH finding this run.

## Gates run

| Gate                                    | Result                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run audit` in `engine-java/`       | Pass: all 5 engine checks.                                                                                                                             |
| `npm run audit` in `web/`               | Pass: all 10 checks. Coverage run 584 files, 7343 tests. `desktop`: 0 new warnings, 23 known, 0 stale. `fields`: 0 new differences, 48 known, 0 stale. |
| `npx knip` in `web/`                    | Clean.                                                                                                                                                 |
| `npx tsc --noEmit` in `website/`        | Pass (run by hand; no gate runs it, see F5).                                                                                                           |
| `npm run verify`, `npx playwright test` | Not run separately. `npm run audit` runs the same typecheck, lint and unit suite; the e2e suite was not run in this audit.                             |

**`KNOWN` lists.** `fieldReadback.kernel.test.ts`, `geometryParity.kernel.test.ts` and `catalogPatch.kernel.test.ts` have empty `KNOWN` lists. The entries in `web/scripts/check-desktop-fields.mjs` and `web/scripts/check-ork-opens.mjs` cite no finding ID; each states its reason in words (a RockSim format limit, something desktop's RockSim reader does not read, an embedded thrust curve 24.12 cannot read, a bundled example as it ships). No citation needed rewriting. One entry pair records an app choice that contradicts its own code comment and is reported as F24.

---

## 🔴 Security

No findings. The CSV, KML, GPX, DXF, 3MF and SVG writers neutralize or escape every file-sourced value; remote fetches (`remoteData`, `thrustcurve`) have staged timeouts, a streamed byte cap and shape checks; every user-file reader caps size before decoding; no `dangerouslySetInnerHTML`; every `target="_blank"` carries `rel="noreferrer"`.

## 🟠 Architecture and tooling

### F1 | MED | Catalog row order depends on the operating system, so the manifest hash churns with no data change | VERIFIED

`web/scripts/sync-components.mjs:74-77`. `orcFiles` lists the database folder with `readdirSync` and never sorts it, so rows come out in a different order on Windows than on the Linux runner. `JSON.stringify(previous.components) === ...` in `sync-preset-digests.mjs:341` then sees a change, writes a new `generated` stamp, and `dataManifest` hashes a new value. Evidence: the committed and published copies hold exactly the same 5228 rows (multiset diff 0, digest assignment diff 0) in a different order; rows hash 07c4b2154b7e committed vs 40187ca74a32 published, manifest d938d7a056ac published vs 737cdeea8882 committed. The first publish (data commit 0476da58) already wrote a new hash for unchanged data. Row order also feeds the `taken` tie-break in `presetFor` (`sync-preset-digests.mjs:250-264`); no ties exist today.
**Why it matters:** every browser downloads the 1.87 MB catalog again whenever the run's filesystem order changes.
**Fix:** sort `orcFiles` (and `jarFiles`) by code unit.
**Resolution:** Fixed. `orcFiles` and `jarFiles` sort by code unit (`byFileName`, `scripts/lib/orcText.mjs`). Pinned by `tests/scripts/fileOrder.test.ts`. The next workflow run writes the rows in that order once, then the hash holds.

### F2 | MED | Nothing checks that every preset in the release ends up with a catalog row | VERIFIED (code path; no instance today)

`web/scripts/sync-preset-digests.mjs:221-265, :325-337`; `web/scripts/lib/partRows.mjs:499-500`; `web/scripts/lib/digestCoverage.mjs:150-157`. For every type except parachute the dedupe key is the parsed row, which has no stated `Mass`, no `Image` and, for tubes, no `Filled`. Two `.orc` elements that differ only there collapse into one row and desktop's second preset (its own digest) disappears. `digestChanges` counts it as `gone` without refusing; the floors still read 100%. Today the published catalog matches `PresetDump` of the pinned 24.12 jar exactly: 5228 presets, per-type counts equal, digest sets equal.
**Why it matters:** a future database change can publish green with a part missing, and every saved `.ork` using it loses its part link.
**Fix:** refuse the write when any dumped digest is carried by no row; key `partRowKey` on the whole element block for every type.
**Resolution:** Fixed. `sync-preset-digests` refuses to write when a preset of the release has no row (`presetsWithoutRow`, `scripts/lib/digestCoverage.mjs`). Pinned by `tests/services/parts/digestCoverage.test.ts`. Not run end to end against the pinned jar in this pass.

### F3 | MED | The catalog workflow does not run when the engine that measures part volumes changes | VERIFIED

`.github/workflows/sync-catalogs.yml:31-36`; `web/scripts/lib/presetVolume.mjs:52, :174-181`. The density of every part that states a mass (1417 rows) is mass / volume measured with `web/src/engine/vendor/openrocket-engine.mjs`. The push trigger watches only `web/scripts/**` and the workflow file. `deploy.yml` ships a new engine on every master push, and `channel-deploy.yml:118-119` points dev, beta and hotfix at the same `@data` branch. Not stale today.
**Why it matters:** after an engine bump that changes part volumes, stated masses fly wrong for up to 7 days, until the Monday run. `catalogPatch.kernel.test.ts` checks only the committed copy.
**Fix:** add `web/src/engine/vendor/**` and `web/src/services/design/treeEdit.ts` to the push paths.
**Resolution:** Fixed. `web/src/engine/vendor/**` is a push path of `sync-catalogs.yml`. Pinned by `tests/repo/ciTriggers.test.ts`, which also reads the engine folder out of `presetVolume.mjs`.

### F4 | MED | The text gates do not scan the Onshape FeatureScript, and it breaks the house rules | VERIFIED

Gate lists: `web/tests/repo/noEmDash.test.ts:233-245`, `cspell.json:26-49`, `web/tests/repo/commentsStateTheConstraint.test.ts:94-109`. None scans `onshape/` or `design/onshape-sheet/`. U+2014 appears in user-facing error and print text at `onshape/converter/AstraRocketOnshapeImport.fs:117, :1296` and `onshape/converter/component_sketches.fs:1585, :1604, :1659, :1970`. British spellings in comments at `AstraRocketOnshapeImport.fs:409, 1248, 1269, 1438, 1516, 1571-1608, 1712, 2189, 2338` and `component_sketches.fs:460, 1278, 1347, 1354, 1749, 1797`. History narration at `AstraRocketOnshapeImport.fs:1593, 2128` and `component_sketches.fs:1789, 1952, 1956, 2000, 2017`.
**Why it matters:** `noEmDash.test.ts` claims to cover the project's own text, and passes while the FeatureScript users install prints an em dash in its error text.
**Fix:** add `onshape/` and `design/onshape-sheet/` to all three gates (`.fs` to `isCode`), then fix the hits.
**Resolution:** Open. The `.fs` files are generated ("edit osFeature/main.fs", built by `tools/build-fs.mjs`) from a source that is not in this repository; the text has to be fixed there, and the gates extended once it is.

### F5 | MED | The `website/` typecheck runs in no gate, although the audit spec says it does | VERIFIED

`website/package.json:15`; `.github/workflows/gates.yml:102-140`; `web/scripts/audit.mjs:59-96`. The `e2e` job runs only `npm run e2e:core`; no workflow and no audit step runs `website`'s `tsc`. Docusaurus builds through Babel and does not typecheck (`website/tsconfig.json:1-3`). It passes today.
**Why it matters:** a type error in `website/src`, `docusaurus.config.ts` or `sidebars.ts` merges and deploys with every gate green.
**Fix:** add `npm ci && npx tsc --noEmit` in `website/` to the gates.yml `e2e` job, or a `website` step to `audit.mjs`.
**Resolution:** Fixed. A `website` job in `gates.yml` runs `npm run typecheck` in `website/`. Pinned by `tests/repo/ciTriggers.test.ts`.

### F6 | LOW | Three alternate layouts have no axe scan | VERIFIED

`web/e2e/a11y.spec.ts`, `web/e2e/a11y-phone.spec.ts`. Not scanned: the workbench maximized to the whole window (`web/src/components/canvas/CenterToolbar.tsx:161`), a flight chart showing one panel (`expandPanel`, `FlightChart.tsx:150`), a widened dialog (`dialog.expand`, `Dialog.tsx:129`). Every other view, dialog and popup is scanned.
**Fix:** add three SCREENS entries that press those controls.
**Resolution:** Fixed. `web/e2e/a11y.spec.ts` scans "Design / whole window", "Results / Flight / one panel" and "Settings / widened" in all three themes; all pass.

### F7 | LOW | The published catalog's dates were set by hand and are kept by every later run | VERIFIED

Data branch head fd831ffa; `web/scripts/lib/dataManifest.mjs:467`. A hand push on 2026-10-21 rewrote components `generated` to 2026-10-17 and both `catalogs.*.updated` to 2026-10-20, a day before the branch's first publish. Later runs keep `updated` while the hash is unchanged.
**Why it matters:** the app shows an "updated" date that is not when the catalog went live.
**Fix:** republish once through the workflow, or correct the manifest dates.
**Resolution:** Open. Correcting the dates means republishing the live data branch, which is left to the owner.

### F8 | LOW | `check-offline-data` counts top-level keys, not rows, for components | VERIFIED

`web/scripts/check-offline-data.mjs:199, :210-213`. For components `n` is the number of top-level keys (3 or 4), so an empty `components` array passes `n > 0`.
**Fix:** count `components.length`.
**Resolution:** Fixed. The offline check counts rows as `rowCount` does, and the second refresh adds a row rather than a key. Pinned by `tests/scripts/dataManifest.test.ts` (`rowCount`).

## 🟡 Correctness, tests and a11y

### F9 | MED | An `.ork` that desktop opens is refused for an unknown mass component type or cluster configuration | VERIFIED

`web/src/services/files/ork/importReaders.ts:471-472` and `:265-267`. `<masscomponenttype>` and `<clusterconfiguration>` go onto the node unchecked. The bridge throws on an unknown value (`engine-java/src/api/java/api/ComponentFactory.java:1159-1171`, and "Unknown cluster configuration" at `:423-434`). Shape, finish, cross section and the events all go through `enumTag` (`importTags.ts:356-370`), whose own comment names this risk. Desktop's EnumSetter and ClusterConfigurationSetter warn and keep the default (`DocumentConfig.java:367, :419`).
**Why it matters:** with the engine loaded, `buildForImport` fails both attempts and `loadOrk` throws; opened before the engine loads, every later build fails. The writer puts the bad token back out (`exportWriters.ts:250, :427`).
**Fix:** check both through `enumTag` against `MASS_COMPONENT_TYPES` and the ClusterConfiguration XML names; drop an unknown value with a keyed note. Add hostile-import tests that build the result through the bridge.
**Resolution:** Fixed. `massComponentTypeTag` and `clusterTag` (`ork/importTags.ts`) check both through `enumTag`, with keyed notes. Pinned by `tests/services/files/ork/enumFieldUnknown.kernel.test.ts`; the golden fixture now uses the kernel cluster name `4-ring`.

### F10 | MED | The RASAero export drops pods and strap-on boosters silently; its refusal and test cover a tree the editor cannot make | VERIFIED

`web/src/services/files/rasaero/sustainer.ts:226-238`; `web/tests/services/files/rasaeroExport.test.ts:172-193`. The refusal looks only at stage children, but `canHost` (`treeEdit.ts:373-380`) puts a pod set or parallel stage under a body tube, never under a stage. `tubeXml` (`sustainer.ts:166-193`) writes only a tube's lug, rail button and fins.
**Why it matters:** RASAero gets a rocket with no pods or boosters and the user is not told, while the comment and test say this case is refused.
**Fix:** refuse an assembly found anywhere under the sustainer's and boosters' tubes; rebuild the test on a `canHost`-valid tree.
**Resolution:** Fixed. `refuseAssemblies` searches every stage for a pod set or parallel stage. Pinned by "assemblies RASAero cannot hold" in `tests/services/files/rasaeroExport.test.ts`, on trees the editor can make.

### F11 | MED | The RASAero booster departs from desktop's `BoosterDTO` | VERIFIED

`web/src/services/files/rasaero/booster.ts:23-27, 47-50, 71-81` against desktop `rasaero/export/BoosterDTO.java:115-209`. (1) Sums the lengths of every body tube in the stage and writes the first tube's diameter; desktop joins only consecutive same-radius tubes and refuses the first different one (error31). (2) A booster with no fin set gets a `<Booster>` with no `<Fin>`; desktop refuses (error16). (3) A leading shoulder transition is not checked against neighboring radii (error13/14/15), and a non-tube child is skipped where desktop refuses (error11). Whether RASAero crashes on a finless booster is REPORTED.
**Why it matters:** the `.CDX1` describes a different booster from the design, with no warning.
**Fix:** port BoosterDTO's checks with keyed errors.
**Resolution:** Fixed. `writeBoosters` follows `BoosterDTO`: same-radius tubes join, a shoulder must meet both neighbors, anything else after the body refuses, and the body must carry fins. Pinned by "a booster as desktop writes one" in `tests/services/files/rasaeroExport.test.ts`.

### F12 | MED | Shrinking a cone or transition end leaves a fixed shoulder wider than that end; the panel hides it | VERIFIED

`web/src/services/design/treeEdit.ts:187-219` (`updateNode`); `web/src/services/design/fieldRange.ts:187-195`. Desktop clamps the shoulder whenever the end radius is set (`Transition.java:121` `setForeShoulderRadius(getForeShoulderRadius(), doClamping)`, `:232` `setAftShoulderRadius(getAftShoulderRadius())`). The app does not clamp on that edit and the bridge sets the shoulder unclamped (`ComponentFactory.java:194, :259, :267`). `fieldValue` clamps only the displayed value. Probe: nose base 25 to 20 mm with a 24 mm fixed shoulder shows 20 mm; node, kernel and saved `.ork` keep 24 mm.
**Why it matters:** the shoulder flies (mass, CG) and saves wider than its part while the panel shows otherwise. Hits any shouldered cone from a desktop `.ork` or a catalog pick once its diameter is edited.
**Fix:** in `updateNode`, when `foreRadius` or `aftRadius` changes, apply the kernel's clamp to that end's shoulder radius and wall, on edit only. Add a `fieldReadback` seed with a fixed shoulder above its end.
**Resolution:** Fixed. `endShoulderClamp` (`services/design/autoShoulder.ts`) applies the setter clamp on an end edit. Pinned by `tests/services/design/endShoulderClamp.kernel.test.ts`.

### F13 | MED | Load-time repair clamps a shipped catalog part's density, so it flies 11.8% light after a reload | VERIFIED

`web/src/services/design/repairValues.ts` with `web/src/prefs/entryValue.ts:46` (`density: { max: 30_000 }`), run on every workspace load (`state/store.ts:1077`) and `.ork` open (`state/fileSlice.ts:387`). The catalog row SEMROC Astronautics "RT-99D" (legacy, digest 615d458febab424d92854cab0beca929) carries `materialDensity` 34015.66, from its stated 40.26 g spread over the tube volume as `ComponentPresetFactory` does; `catalogPatch` writes it (`treeEdit.ts:634-637`). It is the only row above the ceiling.
**Why it matters:** the part flies its catalog mass in the session it is picked, then 11.8% light after a reload or reopen, with a "repaired" banner. Desktop flies the stated mass. `catalogPatch.kernel.test.ts` never goes through the load path.
**Fix:** raise the ceiling above every catalog-derived density, or skip the repair for a node with a `preset` link. Send each massed row through `repairValues` in `catalogPatch.kernel.test.ts`.
**Resolution:** Fixed. `repairNode` leaves the density of a part linked to its catalog row. Pinned by "is still the mass the part flies at once the design is loaded again" in `catalogPatch.kernel.test.ts`.

### F14 | MED | Per-component aero tables mangle part names that contain a dot | VERIFIED

`web/src/components/canvas/aeroTables.ts:60-67`. `niceName` returns a typed name unchanged only for a kernel default key; every other name goes through `^\[?([^.\]]+)\.([^.\]]+)\]?$` and a CamelCase split. "Fins 4.5in" becomes "5in", "Nose v2.1" becomes "1", "PayloadBay" becomes "Payload Bay". Feeds `dragRows` (:156), `stabilityRows` (:212) and `rollRows` (:240).
**Why it matters:** two parts can both read "6in", so the user cannot tell which drag share, CNα or CP row belongs to which part.
**Fix:** return `raw` unchanged when `!isDefaultComponentName(raw)`. Fix `tests/components/canvas/aeroHeat.test.ts:128-130` (titled "passes through a bare name" but asserts a split) and add a dotted-name case.
**Resolution:** Fixed. `niceName` returns a typed name as typed. Pinned by `tests/components/canvas/aeroHeat.test.ts`.

### F15 | MED | Saving a launch location under another location's name overwrites it silently | VERIFIED

`web/src/components/sim/LocationPicker.tsx:199-211`. A name match picks `existing` and saves over its id. `DesignPropertiesDialog` (`layout/DesignPropertiesDialog.tsx:80`) shows the fixed `library.duplicateName`, "Another rocket already has this name.", although `location.duplicateName` exists.
**Why it matters:** a saved location can be the only record of coordinates measured at a field (`LocationsDialog.tsx:341` says so). One save with a reused name destroys it with no confirm and no undo.
**Fix:** confirm before replacing when `existing.id !== current?.id`; give `DesignPropertiesDialog` a duplicate-text prop and pass `location.duplicateName`.
**Resolution:** Fixed. Saving over another location asks first, and the name dialog says "Another location already has this name." Pinned by `tests/components/sim/LocationPicker.test.tsx`.

### F16 | MED | The motor diameter range slider locks up when both thumbs reach the first stop | VERIFIED

`web/src/components/sim/RangeSlider.tsx:72`. The low thumb gets `zIndex 5` whenever `low >= high`. At stop 0 it covers the high thumb, cannot go below 0, and is clamped to `high` going up, so a pointer or touch user cannot move either thumb. The range persists (`motorPicker:dia2`).
**Why it matters:** the diameter filter stops working for pointer and touch users, and the state survives reloads.
**Fix:** raise the low thumb only when `low >= high && low > 0`, or pick the thumb by drag direction.
**Resolution:** Fixed. The high thumb is on top at the first stop. Pinned by "RangeSlider stacked thumbs" in `tests/components/sim/RangeSlider.test.tsx`.

### F17 | LOW | A material added from the picker can land on a different part | VERIFIED

`web/src/components/design/MaterialPicker.tsx:233-240`. The picker awaits `addCustom` and `materialsForType`, then calls `onChange`. `PropertyPanel` is rendered without a key (`PropertyPane.tsx:12`, `ComponentDialog.tsx:46`), so selecting another part with the same section keeps the instance and `live()` stays true.
**Fix:** capture the target node id before the await and patch that id, or key the panel on `node.id`.
**Resolution:** Fixed. The property panel is keyed on the part in `PropertyPane` and `ComponentDialog`. Pinned by `tests/components/design/PropertyPane.selection.test.tsx`.

### F18 | LOW | A saved custom part still reads as dirty after a successful save | VERIFIED

`web/src/components/design/SavedPartEditor.tsx:59-63, :83`. `dirty` compares raw `meta` with the stored part, which `updateCustomPart` stores through `cleanMeta` (`services/parts/customParts.ts:250-253`).
**Fix:** set `meta` from the returned part after the save.
**Resolution:** Fixed. The editor takes the stored labels after a save. Pinned by `tests/components/design/SavedPartEditor.cleanSave.test.tsx`.

### F19 | LOW | Seconds and CP are hard-coded English in charts, tables and readouts | VERIFIED

Literal " s": `components/canvas/FlightChart.tsx:175, 208`, `FlightPath3D.tsx:331, 396`, `components/sim/SimSummary.tsx:276, 277, 315`, `SimulationsTable.tsx:131, 134`, `MotorDetail.tsx:178, 179`, `MotorSpecDialog.tsx:70`, `MotorCombinePane.tsx:140`, `SimEditor.tsx:319`. Elsewhere the same screens use `t('units.second')` ("с" in ru, "秒" in ja). Literal "CP (...)": `components/canvas/AeroComponentTables.tsx:356-358`, beside a translated `aero.cg`.
**Fix:** use `t('units.second')` (including `aria-valuetext`) and a keyed CP header.
**Resolution:** Fixed. Every listed site uses `units.second`, and the CP headers use a new `aero.cp` key. Pinned by `AeroComponentTables.test.tsx` and `SimulationsTable.test.tsx`.

### F20 | LOW | The first Mach tick on every aero chart reads 0.1 at Mach 0.05 | VERIFIED

`web/src/components/canvas/AeroCharts.tsx:269-270, 307-310` with `aeroTables.ts:368-373`. The first tick is the sweep's first sample, 0.05, printed with one decimal.
**Fix:** print it with enough decimals, or start labels at the first multiple of the step.
**Resolution:** Fixed. `machTickDigits` prints a tick with the decimals it needs. Pinned by `tests/components/canvas/aeroTables.test.ts`.

### F21 | LOW | Clearing a required launch default fills it from the factory default, not from what it was | VERIFIED

`web/src/components/layout/SettingsTabs.tsx:500-503`. `withRequiredFrom(..., DEFAULT_SETTINGS.launchDefaults)`; clearing home latitude puts the shipped site's latitude next to the user's longitude for every new simulation.
**Fix:** pass `from` as the fallback.
**Resolution:** Fixed. A cleared required default keeps the value it had. Pinned by `tests/components/layout/SettingsDialog.test.tsx`.

### F22 | LOW | The "Editing N simulations" status is never announced | VERIFIED

`web/src/components/sim/SimEditor.tsx:84-92, 108-116`. The `role="status"` element mounts together with its text, which the app's own rule (`UpdateToast.tsx:241-246`) says is not announced.
**Fix:** keep the region mounted and swap only its contents.
**Resolution:** Fixed. The status region is always mounted. Pinned by "the multi-edit status" in `tests/components/sim/SimEditor.test.tsx`.

### F23 | LOW | A help search hit snaps back to the section heading instead of the match | REPORTED

`web/src/components/layout/useFrameHighlight.ts:36-44` with `useHelpFrame.ts:59-61`. The 10 s anchor hold treats inserting `<mark>` elements and the match scroll as reasons to jump back; for a hit on the open page `target.hash` is the old hash.
**Fix:** release the hold before marking, or ignore mutations under `mark[data-astra-help-mark]`; pass the hit's hash.
**Resolution:** Fixed for the snap-back: a marked match ends the anchor hold (`holdAnchor`). Pinned by `tests/components/layout/holdAnchor.test.ts`. The old-hash part of the report was not confirmed and is not changed.

### F24 | LOW | A RockSim shock cord with no density flies the kernel's default elastic cord, against its comment | VERIFIED

`web/src/services/files/rktImport.ts:775-784`. Both density keys are deleted; the comment says the cord stays weightless, but the bridge flies its default. `check-desktop-fields.mjs` `KNOWN` entries `rkt:shockcord.density` and `rkt:shockcord.materialName` record the difference.
**Fix:** set `lineDensity: 0` to match MassObjectHandler and remove both entries, or keep the choice and fix the comment.
**Resolution:** Fixed. A cord with no density carries desktop's unnamed, weightless line; both `KNOWN` entries are removed, so `npm run audit`'s `fields` step now holds it to desktop. Desktop refuses a `.ork` material with no name, so the writer names that line `custom`; `check-desktop-fields.mjs` lists the resulting `ork:shockcord.materialName` difference as a format limit, in words.

### F25 | LOW | A stated inner or outer radius of 0 is saved as `auto` | VERIFIED

`web/src/services/files/ork/exportParts.ts:434-443`. `autoRadius` writes `auto` whenever the value is not above 0, even with the `…Auto` flag off. After a save, desktop and re-import resolve a ring's 0 inner radius to the motor tube's bore.
**Fix:** decide only by `node[\`${key}Auto\`] === true`or a missing key.
**Resolution:** Fixed. A stated 0 is written as 0. Pinned by`tests/services/files/orkZeroRadius.test.ts`.

### F26 | LOW | A negative `<overridecg>` is dropped on import | VERIFIED

`web/src/services/files/ork/importTags.ts:601-602`. Desktop stores any value (`RocketComponent.java:693-706`).
**Fix:** keep any finite value, as `overridecd` does.
**Resolution:** Fixed, with the mass override beside it: a mass override is held at 0 or more and a CG override kept as given, as the setters do. Pinned by `tests/services/files/importValueFloors.test.ts`.

### F27 | LOW | Surface, coaxial and mirror_xy offset methods collapse to relative on import | VERIFIED

`web/src/services/files/ork/importReaders.ts:493-497`; writer `exportWriters.ts:437-439`. The bridge supports all of them (`ComponentFactory.java:1123-1141`). Only older or hand-edited files.
**Fix:** keep the four RadiusMethod tokens and `mirror_xy` through import and export.
**Resolution:** Fixed. All four radius methods and `mirror_xy` survive import and export. Pinned by `tests/services/files/ork/assemblyMethods.kernel.test.ts`.

### F28 | LOW | The rocket's reference type is not passed to the kernel | REPORTED

`web/src/services/files/orkImport.ts:46-49`; `web/src/engine/openRocketEngine.ts:815-822`. `<referencetype>` and `<customreference>` are carried for the round trip only; calibers are measured against MAXIMUM, with no import note.
**Fix:** pass them to the bridge, or add a keyed note when not `maximum`.
**Resolution:** Fixed with a keyed import note (`importNote.referenceType`); passing the type to the kernel needs a bridge change and an engine rebuild. Pinned by `tests/services/files/orkReferenceType.test.ts`.

### F29 | LOW | Stored launch defaults are not checked for four keys the bridge requires | VERIFIED

`web/src/services/storage/settings.ts:703-769`. `gravityModel`, `constantGravity`, `relativeHumidity` and `windAltitudeReference` pass through as stored; `JsonLite.dbl`/`str` (`JsonLite.java:307, 321`) throw on a wrong type, and a stored `constantGravity: 0` flies every run.
**Fix:** validate the four keys like the rest of the block.
**Resolution:** Fixed. The four keys are checked and dropped when unusable. Pinned by `tests/services/storage/settings.test.ts`.

### F30 | LOW | A motor with negative propellant or a non-positive total mass is accepted from storage and remote rows | VERIFIED

`web/src/services/motors/thrustcurve.ts:152-161`; guards `motorStore.ts:145-148` (`isCustomMotor`), `thrustcurve.ts:227-237` (`isTcMotor`), `motorDb.ts:156-174` (`isCatalogMotor`). The mass then rises over the burn. The `.eng`/`.rse` readers refuse this (`engParser.ts:85`, `rseParser.ts:121`).
**Fix:** refuse `propWeightG < 0` and `totalWeightG <= 0` in `samplesToMotorSpec`; give `isCustomMotor` the importers' rules.
**Resolution:** Fixed. `samplesToMotorSpec` refuses them (`errors.thrustcurve.badWeight`) and `isCustomMotor` applies the importers' rules. Pinned by `thrustcurve.test.ts` and `motorStore.test.ts`.

### F31 | LOW | A list write deletes stored rows this build cannot validate | VERIFIED

`web/src/services/storage/jsonListStore.ts:67-74`. `mutate` rebuilds from `parse(raw)`, which filters with `isItem`; an older cached PWA tab erases rows a newer build widened. Latent until the first schema widening.
**Fix:** write back the raw rows that fail `isItem` unchanged.
**Resolution:** Fixed. A list write keeps the rows this build refuses. Pinned by `tests/services/storage/jsonListStore.test.ts`.

### F32 | LOW | A refused settings save reverts on the next settings edit | VERIFIED

`web/src/state/SettingsProvider.tsx:72-78`. `update` starts from storage (`loadStoredSettings() ?? s`), not the tab's state; store code reading `loadSettings()` meanwhile uses old values.
**Fix:** start from the tab's state; the `storage` listener already brings in other tabs' writes.
**Resolution:** Fixed. A refused change is laid over storage again by the next one. Pinned by `tests/state/SettingsProvider.test.tsx`. Store code that reads `loadSettings()` directly still sees the stored copy meanwhile.

### F33 | LOW | Canted fin set positions in the PDF, design CSV and `.ork` designinfo are off | VERIFIED

`web/src/services/report/reportModel.ts:429-433`. `topX` comes from `componentInfo(id).positionX`, which for a canted set includes the cant turn about the root midpoint (`FinSet.java:1775-1791`): aft by (chord/2)(1 - cos cant), 0.85 mm for 50 mm at 15 degrees.
**Fix:** take the start from `axialFrames(tree).get(id).start`; add a kernel test against `positionX` less that closed form.
**Resolution:** Fixed. `finSetPositions` subtracts `cantFrontShift` (`tree/finPlanform.ts`). Pinned by `tests/services/report/finSetPositions.kernel.test.ts`.

### F34 | LOW | `after` positions are resolved as "previous sibling" for every part type | VERIFIED

`web/src/tree/position.ts:201-212`. The kernel does so only when `isAfter()` is true; FinSet, InnerTube, LaunchLug, MassObject and TubeFinSet override it to false (`FinSet.java:159`, `InnerTube.java:176`, `LaunchLug.java:134`, `MassObject.java:53`, `TubeFinSet.java:216`) and resolve to parentLength + offset. `position.test.ts:182-200, 220-233` pin hand-typed results. Desktop never writes AFTER, so only legacy or hand-edited files.
**Fix:** resolve by type; take expected values from the kernel.
**Resolution:** Fixed. `after` resolves by part type. Pinned by `tests/tree/afterPosition.kernel.test.ts`, against the kernel built with `after` as written.

### F35 | LOW | Keyless nose cones and tubes resolve to 0, NaN or 12 mm where the kernel builds its default | VERIFIED

`web/src/services/design/autoRadius.ts:144, 190-198`; `web/src/services/design/discGeometry.ts:25, 49-68, 70-76`. A nose cone with no `aftRadius` is offered as base 0 (kernel 0.025, `ComponentFactory.java:171`); a keyless tube reads as NaN, so a bulkhead draws at `FALLBACK_RADIUS` 12 mm (kernel 23 mm). The flight is correct; panel, schematic, DXF and print solids differ. Needs an older stored workspace or a hand-edited tree.
**Fix:** read through `bodyTubeRadius` and `noseConeAftRadius`; add keyless cases to geometryParity.
**Resolution:** Fixed. `autoRadius.partOf`, `tubeRadii` and `endAt` read keyless parts at the kernel default. Pinned by "keyless nose cones and tubes are read at the kernel radius" in `geometryParity.kernel.test.ts`.

### F36 | LOW | The flight timeline lists a booster's pre-separation events twice | VERIFIED

`web/src/services/flight/flightEvents.ts:299-330`. A booster branch carries copies of its stage's pre-separation events (`FlightDataBranch.java:124-142`), which branch 0 also holds.
**Fix:** for a branch above 0, drop events at or before its STAGE_SEPARATION that branch 0 already holds.
**Resolution:** Fixed. A booster branch's copied events are listed once. Pinned by `tests/services/flight/flightEvents.kernel.test.ts`.

### F37 | LOW | A catalog parachute stating Cd 0 or 0 lines would fly that, where desktop flies the defaults | VERIFIED (no current row)

`web/src/services/design/treeEdit.ts:600-619`; `web/src/services/parts/componentDb.ts:408-416`. `Parachute.loadFromPreset` applies those fields only when > 0 (`Parachute.java:234-284`).
**Fix:** use `> 0` tests; add a zero-field row to the catalogPatch test.
**Resolution:** Fixed. A catalog parachute takes Cd, line count, line length and packed sizes only above 0. Pinned by "a catalog parachute stating a zero" in `catalogPatch.kernel.test.ts`.

### F38 | LOW | Gate gaps: readers and flag combinations missing from `geometryFlags` | VERIFIED

`web/tests/tree/geometryFlags.test.ts:105-152` `READERS` lacks the Onshape export (`services/files/onshapeExport.ts:351-374`, `onshape/meridian.ts:77-132`), the RASAero export (`rasaero/sustainer.ts:125`) and part fitting (`services/parts/componentFit.ts:21-58`). `FLAGS` (`:207-269`) never sets a flipped nose cone with a shoulder, an unclipped power-series transition, or any flag inside a parallel stage.
**Fix:** add them to `READERS` (or `UNAFFECTED` with a reason) and add the flag rows.
**Resolution:** Fixed. `READERS` holds the Onshape export, the RASAero export and part fitting, and `FLAGS` holds a flipped shouldered nose cone, an unclipped power transition and a flag in a parallel stage; every non-reaction is listed with its reason.

### F39 | LOW | Gate gaps: canted fin station and aft tail cones in `geometryParity` | VERIFIED

`web/tests/services/design/geometryParity.kernel.test.ts:92-443, 1716-1720`. The canted fin station is skipped, which is why F33 went unseen; flipped nose cones appear only at the front of the sustainer.
**Fix:** compare the canted station against `positionX - (len/2)(1 - cos cant)`; generate a flipped cone with shape extras, wall and fins at the aft end.
**Resolution:** Fixed. The canted fin station is compared, and flipped nose cones at the aft end are checked over six shapes, walled and filled.

### F40 | LOW | Gate gaps: Design tab fields and app-held rules no kernel test reads | VERIFIED

`web/tests/engine/fieldReadback.kernel.test.ts:22-25` claims "every field the Design tab edits", but `FIELDS` lacks `overrideMass`, `overrideCGX`, `overrideCD`, the three `overrideSubcomponents` flags (`componentFields.ts:458`; emitted by `ComponentFields.java:75-82`) and the bulk, surface, line and fillet material names and densities. App-held rules with no mechanical check: `MAX_ANGLE_STEP_RANGE` (`services/flight/simulations.ts:31-35`), the derived-row limits in `services/design/derivedFields.ts:176-185` (pinned by hand-typed numbers in `derivedFields.test.ts`), `DEFAULT_CHUTE_CD`/`DEFAULT_LINE_COUNT` (`treeEdit.ts:588`, never exercised) and `FALLBACK_RADIUS` (`discGeometry.ts:25`, no kernel counterpart). All match today except the fallback (F35).
**Fix:** add the override and material keys to the readback; have each rule's test read the Java or build through the bridge.
**Resolution:** Fixed. `fieldReadback.kernel.test.ts` reads back the overrides and materials, and `tests/services/design/kernelConstants.test.ts` reads the derived-row limits and the angle step range out of the Java. The parachute defaults are exercised by F37's test.

## 🟢 Dead code

knip is clean, and an import graph rooted at `src/main.tsx` and `src/engine/simWorker.ts` reaches all 504 modules. Exports reached only from tests are the 9 baseline seams in `web/tests/repo/srcExportReach.test.ts:141-151` (test-only exports, intentional).

### F41 | LOW | Engine load failure reason is stored and never shown; one store field is test-only | VERIFIED

`web/src/state/engineStore.ts:36, 81`: `error` is written on every failed load but nothing in `src` reads it (EngineNotice shows only `boot.failed`), it holds English text even for a `KeyedError`, and the JS-chunk failure is not logged. `web/src/state/store.ts:207-208, 694`: `storageWarningKind` is read only by tests.
**Fix:** render `error` through `errorText` in EngineNotice's failed state, or delete it; delete `storageWarningKind` or use it in SaveStatus.
**Resolution:** Fixed. EngineNotice shows the failure reason (keyed when it is) and the failure is logged; `storageWarningKind` is removed. Pinned by `tests/components/layout/EngineNotice.test.tsx`.

---

## Upkeep

Not counted in the defects above. Grouped by rule.

### A comment, doc or test title that states something untrue or out of date

- `web/src/components/canvas/aeroTables.ts:57-59`: "A name the user typed is returned as typed" (see F14).
- `web/tests/components/canvas/aeroHeat.test.ts:128`: titled "passes through a bare name" but asserts a split.
- `web/src/components/canvas/EnvironmentView.tsx:300`: the jsx-a11y disable reason says the pane "holds nothing focusable", but it renders EnvironmentLanding's button (`EnvironmentLanding.tsx:160-169`).
- `web/src/components/common/Stat.tsx:1`: "used by the stability, simulation and tool panels"; no tool panel imports it.
- `web/src/components/design/MaterialPicker.tsx:121-123`: "selecting a different component unmounts this picker" (see F17).
- `web/src/components/layout/SettingsTabs.tsx:451-455`, `web/src/components/sim/LaunchPanel.tsx:206-208`, `web/src/services/flight/requiredLaunch.ts:66-67`: "keeps what it had" / "fills blanks from the previous default" (see F21).
- `web/src/components/layout/FileMenu.tsx:119-121`: the entry list leaves out My materials.
- `web/src/components/sim/MotorDialog.tsx:112-118`: the comment describes the `useCatalog({ onLoaded })` call below, not the line it sits on.
- `web/src/prefs/useUnits.ts:125-127`, `web/src/prefs/units.ts:329-332`: `fmtSi` "stays for export code"; it has no caller in `src`.
- `web/src/engine/simClient.ts:42-50`: `LOAD_TIMEOUT_MS` promises a load that never finishes still fails the call; `dispatch` (:278) arms no ceiling without `timeoutMs`.
- `web/src/services/files/rasaero/sustainer.ts:231-234` and `web/tests/services/files/rasaeroExport.test.ts:166-171`: claim assemblies are refused (see F10).
- `web/src/services/files/rktImport.ts:780-782`: "stays as the handler leaves it, weightless" (see F24).
- `web/src/services/files/ork/exportParts.ts:367-368`: says finish, shape and cross section are free text; only cluster still is.
- `web/src/services/files/ork/importLimits.ts:39-41`: "bounds the per-config re-scanning below"; that scan is in `ork/importConfigs.ts`.
- `web/src/services/files/onshape/meridian.ts:17-23, 111-115`: says the sections give the volume the simulation flies; the bore averages neighboring slice depths, where the kernel cuts each slice to its own (`SymmetricComponent.java:455-486`) (REPORTED).
- `web/src/services/motors/motorDb.ts:7-9`: "the bundle is always available offline"; a data-host build leaves it out of the precache (`vite.config.ts:115-124`).
- `web/src/services/motors/motorStore.ts:24-26`: says catalog motors carry specs only; catalog rows carry bundled curves.
- `web/src/tree/position.ts:203-207`: "the kernel forces [the offset] to zero"; only for `isAfter()` types (see F34).
- `web/src/services/exports/solidMesh.ts:423-427`: "a stated wall is always used as given"; `TubeFinSet.setThickness` clamps it (`TubeFinSet.java:199`).
- `web/src/tree/tubefins.ts:9-11`: leaves out that ComponentFactory turns automatic back on when `outerRadiusAuto` is set.
- `web/src/tree/nodeProps.ts:93-98`: "Every reader that stands a part on a tube ... goes through here"; `discGeometry` and `autoRadius.partOf` do not (see F35).
- `web/src/services/flight/simulations.ts:158-161`: says Recovery finds figures by device name; it matches on `sourceId`.
- `web/tests/engine/fieldReadback.kernel.test.ts:22-25`: "For every field the Design tab edits" (see F40).
- `web/scripts/sync-components.mjs:140`: "the order desktop loads them"; the database order is whatever `readdir` returns (see F1).
- `.github/workflows/sync-catalogs.yml:13-15`: the local refresh recipe leaves out `check:digests`.
- `.github/workflows/gates.yml:98-99` and `.github/workflows/e2e-full.yml:3-4`: claim pushes to other branches run the gates; `ci.yml` has only a `pull_request` trigger.
- `docs/AUDIT_PROMPT.md:25`: describes `build-and-test` as `npm run verify`, gives `e2e` the website typecheck, and puts `update-flow` in gates.yml. In fact `build-and-test` is a typecheck/lint/build matrix (`gates.yml:31`), the unit suite is the `unit` job (`gates.yml:66`), `e2e` runs only `e2e:core`, and `update-flow` is in `e2e-full.yml:77`.
- `docs/DEVELOPER.md:214`: "`npm run verify` ... the same gate list CI runs, in the same order"; CI also runs `e2e:core` and its jobs run in parallel.
- `web/tests/repo/ciTriggers.test.ts:17`: "keeps the full gate set on every pull request"; it checks only that `ci.yml` calls `gates.yml` (deleting the `unit` job passes).

### A comment that narrates history, outside the comment-history gate

- `onshape/converter/AstraRocketOnshapeImport.fs:1593, 2128` and `onshape/converter/component_sketches.fs:1789, 1952, 1956, 2000, 2017` ("used to ..."). The gate does not walk `onshape/` (see F4).
- The gate also skips `website/docusaurus.config.ts`, `website/sidebars.ts` and `.github/ISSUE_TEMPLATE/*.yml` (no current hit).

### A duplicated helper, formula or list that has drifted or may drift

- Seconds and CP labels: literals against `units.second`, `aero.cg`, `schematic.cp` (see F19).
- `web/src/components/sim/MotorComparePane.tsx:65` vs `:76` and `MotorCombinePane.tsx:195` vs `:209`: the plot label names a curve by `designation`, the legend by `code || designation` ("E26" vs "E26W").
- `web/src/prefs/units.ts:149, 153`: `lbf` and `lbf·s` use 4.4482216; `UnitGroup.java` has 4.44822162, and the file header says the factors come from there.
- Material validators: `isMaterial` (`services/materials/materialStore.ts:34`) accepts a blank name and any group type; `isDocumentMaterial` (`documentMaterials.ts:26`) and `isRow` (`materialTypes.ts:61`) do not.
- Custom motor checks: `isCustomMotor` (`services/motors/motorStore.ts:135-159`) against the importers' header rules (`engParser.ts:82-87`, `rseParser.ts:116-123`) (see F30).
- `discGeometry.tubeRadii` (`:49-68`) and `autoRadius.partOf` (`:144`) restate `nodeProps.bodyTubeRadius`/`noseConeAftRadius` with other fallbacks (see F35).
- Manifest hash formula in `web/scripts/check-offline-data.mjs:298` beside `web/scripts/lib/dataManifest.mjs:465`; row count in the `sync-catalogs.yml:282-289` summary beside `dataManifest.mjs` `rowCount` (:437-441).

### User docs that state something the app does not do

None found.

---

## Recommended order of attack

1. **Small verified fixes that change what users see or fly.** F16 (range slider z-index), F14 (`niceName`), F13 (density ceiling vs catalog), F15 (location overwrite confirm and text), F9 (`enumTag` for mass component type and cluster). Each is a few lines plus a test whose expected value comes from the kernel, the Java or desktop.
2. **Catalog pipeline hardening.** F1 (sort `readdir`), F3 (workflow push paths), F2 (refuse a dumped digest with no row). Then F7 by letting the bot republish, and F8.
3. **Gates that miss their subject.** F5 (website typecheck), F4 (Onshape in the text gates, then fix its em dashes, spellings and history comments), F6 (three axe screens), the `ciTriggers` title, and the `AUDIT_PROMPT.md` / `DEVELOPER.md` CI descriptions.
4. **Shoulder clamp (F12).** Port `Transition`'s clamp into `updateNode` on edit only, with a `fieldReadback` seed for a fixed shoulder above its end.
5. **RASAero export parity (F10, F11).** Walk tube children for assemblies, rebuild the test on a `canHost`-valid tree, then port `BoosterDTO`'s checks.
6. **LOW correctness, grouped by file.** Import and export (F24 to F28), storage and validation (F29 to F32), geometry and reports (F33 to F37), components (F17 to F23), engine notice (F41).
7. **Test coverage gaps (F38 to F40).** Add the missing readers, flag rows, generator cases and readback fields; each new case takes its expected value from the kernel.
8. **Upkeep.** Fix the untrue comments and drifted lists in one pass.

Every fix ships with a test that fails on the code before the fix (checked in a scratch copy per "Fixes" in `docs/AUDIT_PROMPT.md`) and then goes through `docs/AUDIT_PROMPT_CHANGES.md`.
