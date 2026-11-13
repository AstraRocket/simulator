# AUDIT - `web/` engineering audit (AstraRocket)

<!-- cspell:ignore Strg LDPE baselined -->

Date: 2026-11-09. Branch `dev` at 906513c. Run per `docs/AUDIT_PROMPT.md`: eight parallel review agents, one per slice (1, 2, 3a, 3b, 4, 4b, 5, 6), then an independent verification pass over every MED and HIGH claim, merged here. The duplication audit (`docs/AUDIT_DUPLICATION.md`) and the engine audit (`docs/AUDIT_ENGINE.md`) ran in the same pass; defects they found that a user sees are listed here too, under the IDs of this report.

Paths and line numbers are as of 906513c. If one does not match, search for the quoted expression.

## How to read this

- **VERIFIED** means the cited lines were read and the claim confirmed by a second reader, independently of the agent that raised it (and against the Java, for a port), or the agent demonstrated it with a probe named in the finding. **REPORTED** means an agent raised it with citations and it is plausible, but it was not confirmed that way.
- Severity follows the reporting bar in `docs/AUDIT_PROMPT.md`: HIGH and MED are wrong numbers, lost work, a file desktop reads differently, a control that fails, a security hole, or a gate that passes while its subject is broken. LOW is reported only for security and correctness.
- Upkeep is listed after the defects and is not counted in them.

## Status

| Category                       | HIGH  | MED    | LOW    | Total  |
| ------------------------------ | ----- | ------ | ------ | ------ |
| 🔴 Security                    | 0     | 1      | 0      | 1      |
| 🟠 Architecture and tooling    | 0     | 1      | 5      | 6      |
| 🟡 Correctness, tests and a11y | 0     | 10     | 33     | 43     |
| 🟢 Dead code                   | 0     | 0      | 1      | 1      |
| **Total**                      | **0** | **12** | **39** | **51** |

Open: 1 (F46). Fixed: 48: F4, F48, F49, F50 and F51, found and fixed while moving the catalogs, writers and tests to the engine's commit, the 20 of step 1 in the order of attack, F9, F1, F10, the seven of step 5, F11, F13, F3, F5, F8, F47, and the seven of step 8. Kept and recorded as decisions: F26 and F45. No HIGH finding this run.

## Gates run

| Gate                              | Result                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run audit` in `engine-java/` | Pass: all 5 checks. See `docs/AUDIT_ENGINE.md` E6 for what the `committed` step does not check.                                                                                                                                                                                                                                                                             |
| `npm run audit` in `web/`         | Pass: all 10 checks. Coverage run 647 files, 8013 tests. `fields`: 0 new differences, 53 known, 0 stale. The first run stopped at `desktop` because the local desktop build (`engine-java/.openrocket-build`) was at b047c95; it was rebuilt at the pinned 2d76b97 (`npm run openrocket:build`, after fetching that commit into the build clone) and the second run passed. |
| `npm run knip` in `web/`          | Clean.                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run metrics` in `web/`       | 7128 functions; 4 over 200 lines and 11 over complexity 30, each with a disable whose reason holds (the `MaterialPicker` reason is incomplete; see upkeep). `docs/CODE_QUALITY.md` figures are stale (see upkeep).                                                                                                                                                          |
| ESLint rule planting              | Every config block was checked by planting a violation in a scratch copy of `web/`: every rule fired, including the size and complexity limits, the non-null ban, the layer import bans, `jsx-a11y-x`, the Vitest and Playwright rules, and an unused disable.                                                                                                              |
| `npx playwright test`             | Not run. The axe scan list was audited by reading (F5).                                                                                                                                                                                                                                                                                                                     |
| Published catalogs                | Fetched from the `data` branch (head 56dfbc7) and through jsDelivr (byte-identical), and compared with the committed copy. Since regenerated from the engine build (`npm run openrocket:build`): 5228 presets in `PresetDump` of that build, every one with a digest.                                                                                                       |

**`KNOWN` lists.** `fieldReadback.kernel.test.ts`, `geometryParity.kernel.test.ts` and `catalogPatch.kernel.test.ts` have empty `KNOWN` lists. In `web/scripts/check-desktop-fields.mjs`, one entry named an open defect without an ID (`rkt:stage.overrideCGX`, "OPEN: ..."); it now cites F11. Every other entry there and in `web/scripts/check-ork-opens.mjs` states its reason in words (a RockSim format limit, something desktop's RockSim reader does not read, a bundled example saved against an older motor database). One of those was wider than its reason (F4, fixed).

**Previous findings.** F4 of the 2026-10-24 run (the text gates skip `onshape/` and `design/`) is still open and is F3 here. F7 of that run (hand-set catalog dates) is overtaken: data commit 434d822 republished through the workflow, which set both dates itself. F23 of that run is still present in part and is F34 here. The other fixes of that run were re-read and hold (F9 to F11, F24 to F31).

---

## 🔴 Security

### F1 | MED | A crafted `.ork` of under 1 KB freezes the tab: nested assemblies multiply instances with no cap | VERIFIED (measured)

`web/src/services/files/ork/importLimits.ts:16-25`; bridge `engine-java/src/api/java/api/ComponentFactory.java:60, :588, :817`; `web/src/engine/openRocketEngine.ts:646-648`. Each assembly is capped at 64 instances on both sides, but nothing caps the product. Three nested pod sets of 64 make 262,144 instances: on JS `buildRocket` took 9.6 s and `getStaticInfo` 3.9 s, and four levels is 64 times that. The file is depth 7, inside every import cap, and `buildTree` runs `buildRocket` synchronously on the main thread during `loadOrk`.
**Why it matters:** `importLimits.ts:8` states the limits exist to stop a file freezing the tab; on WASM-GC an out-of-memory trap cannot be caught.
**Fix:** track the cumulative instance multiplier (assembly instances, line instances, clusters, fin counts) in `importLimits` and in the bridge (`AUDIT_ENGINE.md` E28), refusing above a total such as 4096 with a keyed note. Test: a nested-pod file is refused before `buildRocket` is called.

**Resolution:** Fixed with `AUDIT_ENGINE.md` E28 and E29. `checkBuildSize` (`importLimits.ts`) refuses a file whose copies, multiplied out and summed, pass `MAX_TOTAL_INSTANCES` (20,000), or with more than `MAX_AUTO_RADIUS_RUN` (16) automatic radii in a row, in `parseDesignFile` before `buildRocket`; `MAX_COMPONENTS` is now 1,000; the bridge refuses the same tree before any kernel work. Pinned by `designFile.test.ts` ("is refused before the engine builds it") and `engineBoundary.test.ts`.

No other security finding. The CSV, KML, GPX, DXF, 3MF and SVG writers neutralize or escape file-sourced text; every user-file reader caps size before decoding; remote fetches have timeouts, byte caps and shape checks; there is no `dangerouslySetInnerHTML`; every `target="_blank"` carries `rel="noreferrer"`.

## 🟠 Architecture and tooling

### F3 | MED | The text gates do not scan the Onshape FeatureScript or the root shell scripts | VERIFIED

`web/tests/repo/noEmDash.test.ts` does not walk `onshape/` or `design/` (open since the previous run's F4, where the `.fs` hits are listed) or the root `*.sh` and `*.bat` files. `commentsStateTheConstraint.test.ts:49-63` skips `website/docusaurus.config.ts`, `website/sidebars.ts`, `.github/ISSUE_TEMPLATE/*.yml`, `engine-java/*.mjs`, `engine-java/*.gradle` and `design/onshape-sheet/build.mjs`; `cspell.json:22-45` skips `engine-java/*.mjs`, `engine-java/**/*.gradle`, `design/onshape-sheet/*` and `web/scripts/**/*.d.mts` (a run over them finds 3 unknown words and no British spellings). A grep of the skipped files found no history phrases and no U+2014 beyond the known `.fs` hits.
**Why it matters:** the gates pass while files the house rules cover are never read.
**Fix:** widen each gate's file list to every tracked authored tree, and fix the `.fs` hits.
**Resolution:** Fixed. The em dash gate reads `onshape/`, `design/` (its images and PDF aside) and the root `.sh` and `.bat` files; the comment gate reads all of `engine-java` but its build output, the extracted upstream source and `patches/`, plus `onshape/`, `design/`, the website's config and sidebars and the issue templates, with Gradle and FeatureScript read as JavaScript; `cspell.json` takes the same trees and `web/scripts/**/*.d.mts`. What they found is fixed: the six em dashes and nine history comments in the FeatureScript, its British spellings (comments and two local parameter names only; a tab method spelled the British way in a file is still read), and the project words. Each gate's scope test names the new trees.

### F4 | LOW | The motor digest `KNOWN` entry accepts every digest difference | REPORTED

`web/scripts/check-desktop-fields.mjs:205-208` (`ork:config.motor.digest`, no `when`). Its reason is catalog digests synced from 24.12, but it also absorbs an embedded custom motor whose digest the app computes differently from desktop (see F13), after which desktop refuses the embedded curve and can fall back to a same-named database motor. Whether the samples include such a motor was not checked.
**Fix:** a `when` that matches only motors whose digest came from a catalog row.
**Resolution:** Fixed. With the catalogs built from the engine's commit, the 24.12 reason no longer applies; what the entry still meets is a bundled example's own digest, saved against an older motor database, which the app keeps on a motor it did not change. The entry now states that and matches only a digest the catalog does not hold (`when: (a) => !CATALOG_DIGESTS.has(a)`), so a catalog digest that desktop reads differently is a new difference. `npm run audit`'s `fields` step: 0 new, 53 known, 0 stale.

### F5 | LOW | The axe scan never covers the Benchtop tab without a dialog over it | REPORTED

`web/e2e/a11y.spec.ts:192-298` (`SCREENS`). The Benchtop tab (`'simple'`, `web/src/state/tabs.ts:1`) has no entry; it is scanned only under the help popup with blank inputs and under the motor guide dialog. The filled result card (`components/tools/SimpleResults.tsx:47+`) and the warn and danger notices (`:19-42`) are never scanned, in any theme. The list is not typed against `Tab`, unlike the other surface lists. That axe skips content behind the overlay was not run.
**Fix:** "Benchtop" and "Benchtop / flown" entries, and drive the top-level list from a `Record<Tab, ...>`.
**Resolution:** Fixed. `TAB_SCANS` is a `Record<Tab, Scan[]>`, with "Benchtop", "Benchtop / too short" and "Benchtop / flown" (which waits for a warning on the card). The scans found two faults, both fixed in `SimpleResults.tsx`: the result card's `<dl>` nested each term in two divs and put its warning in a `<p>` (78 hits on axe's definition list rules), and the problem notice was 4.27:1 in the light theme on the page background, now `warn-200`. All Benchtop scans pass in the three themes.

### F6 | LOW | The geometry parity generator never builds the keyless cases that F23 and F24 hit | VERIFIED

`web/tests/services/design/geometryParity.kernel.test.ts:163-215, :260-262, :274-299, :1127-1148, :1682-1755`. Every recovery part and mass component is generated with `radiusAuto: true` and no rule compares a drawn packed radius; every freeform fin set has `points`; every tube fin set states its wall, so the keyless wall rule (`autoRadius.ts:637-643`) never runs; no assembly is placed with `after`. `kernelCutOutline` builds its expected contour with the same assembly as `finCutContour`, so that step checks the app against itself (the kernel's `generateContinuousFinAndTabShape`, `FinSet.java:1389-1436`, walks a multi-point root differently).
**Why it matters:** the gate passes while F23 and F24 are open.
**Fix:** add those cases and rules, and state in the cut-outline rule that its shape is the app's choice.
**Resolution:** Fixed. `withKeyless` strips the packed radius from recovery parts and mass components, the points from freeform sets and the wall from tube fin sets; `withAfterAssemblies` saves pods and boosters with `after`, which the kernel reads as saved and the app reads as the loader resolves them. New rules compare the drawn packed radius, a keyless outline and its span, a tube fin bore and the station of a pod or booster saved `after`; put back the old fallbacks and they fail. The cut-outline rule now states that the joined shape is the app's choice.

### F7 | LOW | The shape-flag test misses readers and flag combinations | VERIFIED (tables), REPORTED (shoulder caps)

`web/tests/tree/geometryFlags.test.ts:94-136, :465-484, :486-543`. `FIN_READERS` lacks fin flutter (`flutterFin` reads the span over the mount), the Onshape export, the RockSim export and RASAero; `FIN_FLAGS` uses only a freeform set, so cant on a trapezoid or elliptical set never reaches the drawing readers; `FLAGS` never toggles `shoulderCapped`, `foreShoulderCapped` or `aftShoulderCapped`.
**Fix:** add them, or list each pair in `UNAFFECTED` with its reason.
**Resolution:** Fixed. `FIN_READERS` adds fin flutter and the RockSim, Onshape and RASAero exports, each reading only the fin's own entry; `FIN_FLAGS` cants a trapezoidal and an elliptical set; `FLAGS` caps a nose cone shoulder and each transition shoulder; an `ejection bay` reader carries F20's cases. Each pair that does not change has its reason in `UNAFFECTED`. The 3D view not drawing a cap is listed in `KNOWN` and is F52.

### F8 | LOW | The CI trigger test can pass while the `website` job is gone | VERIFIED

`web/tests/repo/ciTriggers.test.ts:41`: `split(/^ {2}website:s*$/m)` has `s*` where `\s*` is meant, and the section has no end bound (unlike the `repo` split at `:16-17`), so a job added after `website` would be read as part of it.
**Fix:** `\s*` and an end bound.
**Resolution:** Fixed, as the `repo` split does it.

## 🟡 Correctness, tests and a11y

### F9 | MED | The launch documents count every mount that shares a motor object, so installed impulse is N² times one motor | VERIFIED

`web/src/services/flight/launchDocs.ts:83-84, :97, :104, :133-134`. `copies.set(s.spec, (copies.get(s.spec) ?? 0) + s.count)` keys by the `MotorSpec` object, and each row then takes that total. `loadOrk.ts:171-180, :268-273` hands one cached spec to every mount flying the same motor, and `flightConfigs.ts:156` seeds new mounts with the shared `C6` constant. Three inner tubes each with a ~120 N·s G motor (360 N·s, I class, L1) print as 1080 N·s, J class, L2 (`FlightCard.tsx:139, :163`). A JSON reload separates the objects, so the error comes and goes. `powerClass.ts` is unaffected.
**Why it matters:** a printed safety document states the wrong total impulse and certification level.
**Fix:** have `seatedMotors` return the mount id and take each row's count from its own mount. Test: two mounts holding one spec object give impulse × 2, with the expected value from the motor's catalog impulse.

**Resolution:** Fixed. `seatedMotors` returns each motor's `mountId`, and each row takes its count from its own mount. Pinned by `launchDocs.test.ts` ("counts each mount once when two mounts share one motor object"), with the expected 300 N·s per motor taken from its thrust curve.

### F10 | MED | One drag in the freeform fin editor can stop the whole design from building | VERIFIED

`web/src/components/design/useFreeformEditing.ts:37-43, :68-80, :82-104`. Vertex moves, inserts and deletes commit with no self-intersection check (`services/exports/solidMesh.ts:153` `isSimplePolygon` exists but only the mesh export uses it). The kernel rolls back a crossing outline and the bridge then throws for the whole build (`ComponentFactory.java:276-283`: "its outline crosses or touches itself"). Import retries without outlines (`loadOrk.ts:122-133`); live editing has no fallback. Desktop's `setPoint` refuses the move instead.
**Why it matters:** figures and simulations stop until undo, and the editor shows nothing wrong.
**Fix:** run a segment-intersection test matching the kernel's in `setPoint`, `insertAfter` and `removeSel`, keeping the last good outline. Test: the kernel through the bridge refuses the outline the editor refuses.

**Resolution:** Fixed. `outlineCrossesItself` (`services/design/finOutline.ts`) ports `FreeformFinSet.intersects` with its `setPoints` snapping and `Line2D` semantics. `useFreeformEditing` runs it on every move, insert and delete, refusing the edit and keeping the last good outline, as desktop's `setPoint` does. Pinned by `engineBoundary.test.ts` ("refuses exactly the outlines the fin editor refuses", 153 outlines on a 1 mm grid, both verdicts present) and `FreeformFinEditor.test.tsx`.

### F11 | MED | The `.rkt` stage mass and stack CG differ from desktop's | REPORTED (cause not isolated)

`web/src/services/files/rocksim/stageStacks.ts:22-46`, `rktExport.ts:595-613`; `KNOWN` entry `rkt:stage.overrideCGX` in `web/scripts/check-desktop-fields.mjs:68-72`. On the every-part design the app writes 816.48 g and 635.02 mm for the sustainer; desktop's `RockSimSaver.setStageOverrides` (`RockSimSaver.java:204-217`, `MassCalculator.calculateStructure` with only that stage active) gives 818.10 g and 634.09 mm, which moves the booster's derived CG. A theory that boosters stay active was checked and refuted: the kernel's `_setStageActive` cascades to sub-stages (`FlightConfiguration.java:277`). The remaining candidate is `staticInfo().massEmpty` against `calculateStructure`. The entry's `when` (`|a - d| < 0.005`, 5 mm) is about five times wider than the 0.93 mm it describes.
**Why it matters:** a `.rkt` with stage overrides is read back with a different booster CG.
**Fix:** weigh as `calculateStructure` does, then remove the entry; until then narrow `when` to the stated difference.
**Resolution:** Fixed. The cause was the weighing, not the formula: the app switched stages off in the build's selected configuration, which shortens the rocket, and an automatic shock cord is as long as the rocket, so the sustainer's cord lost 0.3 m (1.62 g) and its CG moved. Desktop weighs in configurations of its own and leaves the selected one whole. The bridge's new `getRockSimStageFigures` weighs as `RockSimSaver.setStageOverrides` does, with every stage on; every-part now writes desktop's 818.10 g and 634.09 mm. The `KNOWN` entry is gone: `npm run check:fields`, 0 new, 52 known, 0 stale. Pinned by `rktStageStacks.kernel.test.ts` ("weighs an automatic shock cord at the whole rocket").

### F12 | MED | A cleared launch latitude is saved to `.ork` as 0, a point off Ecuador | VERIFIED

`web/src/services/files/ork/exportSimulation.ts:92-93`: `latitudeDeg ?? 0` paired with `longitudeDeg ?? -80.6`. `LaunchConditions.latitudeDeg` is `number | null` when cleared (`services/design/orkTree.ts:72-74`), incomplete launches persist on simulations (`runPlan.ts:40` skips them), and nothing fills them before export. The default site is 28.61, -80.6 (`services/storage/settings.ts:53-54`, `exports/flightPath/buildModel.ts:79-80`).
**Why it matters:** desktop opens the simulation at a launch site in the Pacific.
**Fix:** one exported default site read by the writer. Test: a cleared latitude round-trips through desktop (`check:fields`) as 28.61.
**Resolution:** Fixed. `KERNEL_LAUNCH_SITE` (`tree/kernelDefaults.ts`) is the one default site; the writer, the settings defaults and the flight-path export read it. Pinned by `orkExport.test.ts` ("writes a cleared site as the default site").

### F13 | MED | An embedded `.rse` motor from desktop or another tool loses its digest match | VERIFIED (against the Java)

`web/src/services/files/ork/embeddedMotors.ts:31-49` (`attrOf`, `rseDigest`); `loadOrk.ts:107-114` runs both it and `parseRse` on one text. `rseDigest` reads `m=""` as 0, accepts hex, and never reads `auto-calc-mass` or `auto-calc-cg`. Desktop's `RockSimMotorLoader` treats an absent or non-"0" flag as calculate (`:248-260`), then hashes the specific mass in place of the per-time mass and leaves out the CG series (`:355-361`), and parses `m=""` as NaN (`:457-464`). The app's own writer emits both flags as "0", so its round trips match.
**Why it matters:** a desktop-embedded motor misses the digest and falls back to a name match, which can fly a different motor of the same name.
**Fix:** have `parseRse` return the parsed rows and flags, and compute the digest from them as `RockSimMotorLoader` does. Test: digests of desktop-written `.rse` files equal desktop's.
**Resolution:** Fixed. `parseRseWithDigests` hashes the rows it reads as `RockSimMotorLoader.getMotor` does: an absent or non-"0" flag, or an empty, missing or unreadable value anywhere in a series, makes that series calculated, so the launch and burnout masses replace the mass series and the CG series is left out. The regex digest is gone. Pinned by `motorDigest.test.ts` ("a mass or CG desktop calculates"), eight files whose expected digests come from the engine build's own loader.

### F14 | MED | Every part added in the app is written to `.rkt` with an empty name | VERIFIED

`web/src/services/files/rktExport.ts:110` writes `n.name ?? ''`; `defaultNode` (`services/design/treeEdit.ts:511`) never sets a name. The `.ork` writer (`exportParts.ts:115-116` with desktop default names in `exportWriters.ts`) and the Onshape writer (`onshapeExport.ts:130` `DESKTOP_NAMES`) fall back to desktop's names.
**Why it matters:** RockSim and desktop read every app-added part with no name.
**Fix:** one `DESKTOP_PART_NAMES` table used by all three writers. Test through `check:fields`.
**Resolution:** Fixed. `services/files/desktopPartNames.ts` holds desktop's names; the `.ork`, `.rkt` and Onshape writers all read it. Pinned by `rktExport.test.ts` ("writes desktop's name for a part the user never named").

### F15 | MED | Imported motors cannot be ticked in the Motors dashboard | VERIFIED

`web/src/components/sim/MotorGrid.tsx:137-139, :167-171`; `services/motors/motorDb.ts:68-89`. `customToRow` sets no `curves`, so `hasCurve(m)` is false for every imported motor: the dashboard shows "no curve" and disables its checkbox, and the compare pane (`chartScales.ts:33`) drops it. The motor picker and the guide use the right test (`MotorDialogParts.tsx:135` `!m.custom && ...`; `hasLocalCurve`).
**Why it matters:** a control that fails for exactly the motors the user imported to compare.
**Fix:** use `hasLocalCurve` in the grid and the compare pane.
**Resolution:** Fixed. An imported motor's row carries its finalized curve (`customToRow`), so the grid ticks it and the compare pane draws it; a flight still reads the stored motor. Pinned by `motorImportFiles.test.ts`.

### F16 | MED | An app update can reload a hidden tab in the middle of a motor guide run | VERIFIED

`web/src/state/workInProgress.ts:6-14` checks `simBusy` and `driftSweepRun` but not `motorGuideRun`, while `runSlice.ts:33-38` and `store.ts:205` list all three. `UpdateToast.tsx:120` applies a waiting update once the tab has been hidden 30 s with nothing in progress (`services/app/updateCheck.ts:17-29`). A catalog-wide guide flies two flights per motor and easily runs that long.
**Why it matters:** the user comes back to a reloaded app with the guide and its progress gone.
**Fix:** one exported list of running jobs that `workInProgress`, `abortRunWork` and `replaceWorkspace` all read.
**Resolution:** Fixed. `jobRunning` (`state/runSlice.ts`) lists every job `abortRunWork` stops, the guide included; `workInProgress` reads it. Pinned by `workInProgress.test.ts` ("is true while a motor guide flies").

### F17 | LOW | A 0 entered for a speed warning is accepted, then silently replaced by the default | VERIFIED

`web/src/components/layout/SettingsTabs.tsx:375-396` pass `min={0}`; `services/storage/settings.ts:381-392` `pos()` replaces anything not above 0 with the default (15, 20, 30.48, 15.24, 3.048) on the next load. **Fix:** a positive `min`, or accept 0 and define it as "never warn".
**Resolution:** Fixed. The boxes floor at 0.1 m/s, a limit the load keeps. Pinned by `SettingsTabs.test.tsx` ("a speed warning limit").

### F18 | LOW | The printed flight card ignores the user's units for rail length, rail angle and wind, and prints "cal" in English | VERIFIED

`web/src/components/sim/FlightCard.tsx:131, :181, :185, :189`; `services/report/pdfPage.ts:374-375`. Rail length uses `distance` (the panel uses `length`), the angle is `${fmtNum(deg, 1)}°` (ignores the angle unit), wind uses `velocity` (the panel uses `windspeed`), and stability is a literal "cal" (de "Kal.", ru "кал"). **Fix:** `length`, `fmtDegrees`, `windspeed` and `t('stability.caliber')`.
**Resolution:** Fixed. Rail length uses `length`, the angle `fmtDegrees`, wind `windspeed`, and stability `stability.caliber`, on the card and the PDF. Pinned by `FlightCard.test.tsx` ("prints the rail and wind in the units the launch panel uses").

### F19 | LOW | The site map scale bar reads "0 km" or "0 mi" for km and mi users | VERIFIED

`web/src/components/sim/SiteMap.tsx:226-235`: `SCALE_PROMOTION = { m: 'km', ft: 'mi' }` has no entry for km or mi users, who fall to `u.fmtSym('distance', m, 0)`; at the default zoom 100 px is about 478 m times cos(latitude). `WeatherParts.tsx:17` `FAR_UNIT` has the full table. **Fix:** one shared far-unit table with a small-unit fallback below 1.
**Resolution:** Fixed. `FAR_DISTANCE_UNIT` and `NEAR_DISTANCE_UNIT` (`prefs/units.ts`) are shared by the weather panel and the map; `fmtSpan` falls back to m or ft below 1. Pinned by `tests/prefs/fmtSpan.test.ts`.

### F20 | LOW | The ejection bay's bore and length ignore the default wall, filled tubes and flipped cones | VERIFIED (against the Java)

`web/src/services/flight/ejectionBay.ts:36` computes the bore as `2 * (bodyTubeRadius - num(tube, 'thickness', 0))`, so a keyless wall gives the outer diameter and a filled tube a nonzero bore (`BodyTube.getInnerRadius` is 0 when filled); `discGeometry.ts:26-34` `tubeRadii` is right. `shoulderBlocks` (`:69-91`) counts a flipped nose cone's shoulder on the wrong side, ignores a flipped nose cone after the tube (`NoseCone.java:105-106`), and counts a shoulder of zero radius. **Why it matters:** the suggested charge scales with bay volume. **Fix:** `tubeRadii` and `shouldersOf`/`hasShoulder`.
**Resolution:** Fixed. The bore is `tubeRadii`'s, and a shoulder closes the bay only where `hasShoulder` holds and on the side `shouldersOf` puts it, so a flipped nose cone plugs the tube in front of it. The shoulders are now looked for among the tube's own siblings, so a nose cone in a pod set or booster closes its bay too (found by the new reader). Pinned by `ejectionBay.test.ts` and the `ejection bay` reader in `geometryFlags.test.ts`.

### F21 | LOW | The phone design summary draws part tags in English in every language | VERIFIED

`web/src/components/canvas/SchematicPreview.tsx:37` passes no `typeTag`, so `schematicParts.tsx:410` falls back to the English `TYPE_STYLE` tags (`:270-280`: "BH", "TC", "IT", "chute", "CR"); `TreeSchematic.tsx:110` passes `t('schematic.tag.*')`. **Fix:** make `typeTag` and `partName` required and pass them from the preview.
**Resolution:** Fixed. `partName` and `typeTag` are required in `SchematicShapesCfg`, and the preview passes the translated ones. Drawing tests pass English labels (`tests/testing/schematicLabels.ts`).

### F22 | LOW | The motor guide's status tooltips show kernel units | VERIFIED

`web/src/components/sim/MotorGuideDialog.tsx:469` calls `warningText(w.message, lt)` without the unit formatter the other three callers pass. **Fix:** pass `(q, si) => u.fmtSym(q, si)`.
**Resolution:** Fixed. The guide passes the unit formatter, as the other three callers do. No test: the guide table has no component test.

### F23 | LOW | A recovery part with no radius is drawn at 70% of the tube, not the 12.5 mm it flies | VERIFIED (against the Java)

`web/src/tree/schematicGeometry.ts:250-257` (`internalExtent`); drawn by `schematicParts.tsx:359`, `rocketPieces.ts:463` and `aftScene.ts:352`. The kernel flies `MassObject`'s 12.5 mm (`MassObject.java:37-39`; the bridge sets a radius only when one is stated). New parachutes, streamers and shock cords have no `radius` (`treeEdit.ts:644-670, :695-702`), so this is the common path: 16 mm in a 25 mm tube, 34 mm in a 50 mm tube. Flight is unaffected; the panel shows 25 mm. **Fix:** `kernelDefault(type, 'radius')` as the fallback, with no cap.
**Resolution:** Fixed. `internalExtent` falls back to `kernelDefault(type, 'radius')` with no cap. Pinned by the geometry parity rule "drawn packed radius, no radius key" and `schematicShapes.test.tsx`.

### F24 | LOW | A freeform fin set with no points is drawn as a 3-point triangle while the kernel flies its 4-point default | VERIFIED (against the Java)

`web/src/tree/position.ts:37-39` (`freeformPoints` returns `[]`), `tree/finPlanform.ts:19-23, :69-79, :119-124`, `services/exports/solidMesh.ts:263-267`. Readers fall back to `FREEFORM_FALLBACK` (30 mm triangle) and `finSpan` to the trapezoid's 0.03; the kernel flies (0,0), (0.025,0.05), (0.075,0.05), (0.05,0) (`FreeformFinSet.java:33-40`). Reachable from an `.ork` with fewer than 3 usable points (`importReaders.ts:197-198`): drawings, the template, the parts table span, the printable solid, flutter and the RASAero fin area all differ from what flies. **Fix:** the kernel's default as the fallback.
**Resolution:** Fixed. `freeformPoints` returns `KERNEL_FREEFORM_POINTS` (`FreeformFinSet()`'s outline) for a set with no `points`, so every reader takes it; the `.ork` writer writes it. Pinned by the geometry parity rules "outline points, no points key" and "span, no points key".

### F25 | LOW | A pod set or booster saved with `after` is placed after its sibling instead of at the top | VERIFIED (kernel), REPORTED (desktop loader)

`web/src/tree/position.ts:124-135, :166-169`: `NOT_AFTER` lacks `podset` and `parallelstage`. The kernel maps AFTER to TOP for both and keeps the offset (`ComponentAssembly.java:155-160`; `PodSet.java:98`, `ParallelStage.java:112`). **Fix:** add them; extend `afterPosition.kernel.test.ts` with pods, boosters, streamers, shock cords and tube fins.
**Resolution:** Fixed. `AFTER_IS_TOP` in `position.ts` reads `after` as `top` with the offset kept. Pinned by `afterPosition.kernel.test.ts` (pods, boosters, streamers, shock cords and tube fins added) and the geometry parity rule "station, saved after".

### F26 | LOW | The Scale tool scales values desktop's Scale leaves alone | VERIFIED

`web/src/tree/scaleRocket.ts:32-63` scales tube fin sets, fillet radius, leading-edge radius, airfoil sizes and maximum motor length; desktop's `ScaleDialog.java:94-188, :576-596` has no scaler for any of them. `scaleRocket.test.ts` checks the app's own key list. **Fix:** follow desktop or record the choice in `docs/CODE_QUALITY.md`; derive the test's key set from `ScaleDialog`'s table.
**Resolution:** Kept, and recorded in `docs/CODE_QUALITY.md` ("Where the app differs from desktop on purpose"): a scaled rocket keeps its fillets and tube fins in proportion. `scaleRocket.test.ts` ("the Scale tool's keys") holds every part type's scaled keys to `ScaleDialog`'s table plus that named list.

### F27 | LOW | Picking a catalog body tube leaves a filled tube filled | VERIFIED (against the Java)

`web/src/services/design/treeEdit.ts:450-459` (`statedPatch`, body tube). Desktop's pick always sets `filled = false` (`ComponentPresetFactory.java:94-111, :263-299`; `SymmetricComponent.java:189-199`). The tube then flies solid at a density worked out over the hollow volume, and keeps its catalog link. **Fix:** `filled: false` in the patch; a probe in `catalogPatch.kernel.test.ts` that picks onto a filled node.
**Resolution:** Fixed. The body tube patch sets `filled: false`. Pinned by `catalogPatch.kernel.test.ts` ("a body tube picked onto a filled tube").

### F28 | LOW | A saved tube part comes back automatic and takes its neighbor's diameter | REPORTED

`web/src/services/parts/customParts.ts:13-17` with `treeEdit.ts:294-300, :520`. The saved part keeps `outerRadiusAuto: true`, `pinStated` pins only undefined flags, and `syncAutoRadii` then replaces the saved diameter, while the picker lists and ranks it by the stored diameter. **Fix:** drop the auto flags of every dimension `rowGeometry` reports when saving.
**Resolution:** Fixed. `pinSavedSize` turns off the automatic flag of each radius a saved part states, when it is saved and again when it is applied, so parts saved earlier are pinned too. Pinned by `customParts.test.ts` ("keeps the diameter it was saved at, where the tube was automatic").

### F29 | LOW | A `.ork` zip cut off inside a later member's header opens with that member silently missing | VERIFIED (by script)

`web/src/services/files/ork/importUnpack.ts:98-153`. fflate's streaming `Unzip` neither throws nor reports the member (cuts at 13175, 13185 and 13215 of a 26,463-byte zip return only `rocket.ork`). The missing member is typically `thrustcurves/<digest>.rse`, so `loadOrk.ts:432-453` flies a same-named catalog curve with no note. **Fix:** require the central directory and check its entry count after a streaming read.
**Resolution:** Fixed. A streamed read counts only when the end-of-directory record is there and names as many members; otherwise the directory reader runs, which refuses a cut file. Pinned by `orkArchive.test.ts`, which cuts a two-member archive at every byte from the second member's header on.

### F30 | LOW | Opening a design can graft another rocket's bay records onto it and add an undo step | VERIFIED

`web/src/state/useBayBackup.ts:21-32` with `services/storage/bayStore.ts:9, :14-16, :53-58`. The browser copy is keyed by design name ("Rocket" by default) and tube index and name ("0:Body tube"), so a different file with default names gets another rocket's charges and ground tests. The restore goes through `applyTreeAction`, recording an undo step right after load. The key is also built without `nsKey`, so the localStorage fallback shares it across channels. **Fix:** key by something tied to the design and apply without an undo step; `nsKey('recoveryBays:')`.
**Resolution:** Fixed. Each tube's records are kept with its diameter and length, and restored only to a tube of that size, which also keeps charges sized for one bay off another. The restore sets the tree directly, with no undo step, and the key is `nsKey('recoveryBays:')`. Copies kept under the old key carry no size, so they are not read. Pinned by `RecoveryBaysPane.test.tsx`.

### F31 | LOW | The first of two quickly opened examples can replace the second | VERIFIED

`web/src/state/fileSlice.ts:201-208`: `openExample` fetches before claiming the workspace, so a slow first fetch resolves after a later open and wins. **Fix:** take a claim token before the fetch.
**Resolution:** Fixed. `openExample` claims the workspace before the fetch and drops a result a later open has overtaken. Pinned by `openExample.test.ts`.

### F32 | LOW | Kernel build and run failures show an English wrapper sentence in every language | VERIFIED

`web/src/engine/openRocketEngine.ts:58, :80, :85, :88, :677`: `EngineCallError` builds "engine buildRocket failed: ...", reaching the UI through `runnability.ts:108` and the worker's `errorMessage`. **Fix:** a `KeyedError`.
**Resolution:** Fixed. `EngineCallError` is a `KeyedError` (`errors.engine.callFailed`, all 10 languages), so the wrapper sentence follows the language and crosses the worker; the engine's own detail stays as written. Pinned by `openRocketEngine.errors.test.ts`.

### F33 | LOW | The load-repair note quotes densities as raw SI numbers | VERIFIED

`web/src/state/workspaceSelectors.ts:21` with `services/design/repairValues.ts:23`: "a density of 45000 ... reduced to 30000" while the panel shows 30 g/cm³, with "." in comma locales. **Fix:** format through the density unit.
**Resolution:** Fixed. `repairedText` formats through the user's unit (`fmtSymIn`). Pinned by `repairValues.test.ts` ("quotes the densities in the user's unit").

### F34 | LOW | A help search hit on the page already open lands on the first match | VERIFIED (read, not run)

`web/src/components/layout/useFrameHighlight.ts:26-29` with `useHelpFrame.ts:80-89` and `useHelpSearch.ts:30-35`. For the same slug, `navigate` leaves `target` alone, so the highlight scrolls to the first mark after the old hash. The unconfirmed half of the previous run's F23. **Fix:** expose the current in-page anchor and use it.
**Resolution:** Fixed. `useHelpFrame` returns `anchorHash`, the anchor a move within the open page went to, and `useFrameHighlight` scrolls to the first match after it. Pinned by `useFrameHighlight.test.ts` and `useHelpFrame.theme.test.tsx`; not run in a browser.

### F35 | LOW | Changing the Scale dialog's scope keeps the old "From" size | VERIFIED

`web/src/components/design/ScaleDialog.tsx:61-64, :108-112, :156-165`; also `initialSize` (`:29-34`) reads raw keys with 0 where `chainOuterRadius` applies the kernel defaults. **Fix:** re-seed `from` on scope change.
**Resolution:** Fixed. Changing the scope re-seeds From, and `initialSize` reads a chain part's radius and a part's length with the kernel's defaults. Pinned by `ScaleDialog.test.tsx`.

### F36 | LOW | "Backup saved." shows after the user cancels the save | VERIFIED

`web/src/components/layout/BackupDialog.tsx:58-64`; `saveFile.ts:57-58, :68-69` resolve normally on a cancel. A user who then clears site data loses their saved motors, parts and settings. **Fix:** report whether a file was written.
**Resolution:** Fixed. `saveBlob` and `saveText` return false on a cancel, and the dialog says "Backup saved." only on true. Pinned by `saveFile.test.ts` and `BackupDialog.test.tsx` ("says nothing was saved when the user cancels").

### F37 | LOW | Moving a saved location on the map keeps its old elevation | VERIFIED

`web/src/components/sim/LocationEditor.tsx:155-161`; `LaunchSiteSection.tsx:88-90` clears it on a pick. Later simulations fly from the wrong altitude. **Fix:** clear the altitude in `onPick`.
**Resolution:** Fixed. A map pick clears the altitude. Pinned by `LocationEditor.test.tsx` ("drops the old elevation when the map moves the location").

### F38 | LOW | With no average wind, typing in the turbulence % box wipes the gust deviation | VERIFIED

`web/src/components/sim/WindSection.tsx:125-137`, `WindLevelTable.tsx:72-79`: `stdDevForIntensity(0, v)` is always 0. **Fix:** disable the % input when `!hasIntensity(avg)`.
**Resolution:** Fixed. The % box is disabled with no average wind, in the panel (with a hint, all 10 languages) and the profile table. Pinned by `LaunchPanel.test.tsx` ("locks the % box with no average wind").

### F39 | LOW | Constant gravity accepts 0 m/s² | VERIFIED

`web/src/components/sim/EarthModelSection.tsx:47` (`minSi={0}`); the kernel takes it unchecked and the flight never comes down. **Fix:** a small positive floor.
**Resolution:** Fixed. The box floors at `MIN_CONSTANT_GRAVITY` (0.1 m/s²); a file's own value is still read as written. Pinned by `LaunchPanel.test.tsx` ("refuses a constant gravity of 0").

### F40 | LOW | Length, mass and distance fields have no upper bound, and the bridge refuses above 1e6 | VERIFIED

`web/src/services/design/fieldRange.ts:129-145`, `prefs/entryValue.ts:5-8` (density only); `ComponentFactory.java:84, :100-103`. A typo such as 1e9 mm is stored and the build fails "out of range". **Fix:** a 1e6 SI ceiling in `SI_LIMITS`.
**Resolution:** Fixed. `SI_LIMITS` stops length at ±1e6 and mass and distance at 1e6, the bridge's `MAX_MAGNITUDE`. Pinned by `entryValue.test.ts`.

### F41 | LOW | Two status regions mount together with their text and are never announced | VERIFIED

`web/src/components/layout/AppPanes.tsx:26-30` (storage failing) and `components/tools/SimpleResults.tsx:22-24` (why Run is disabled). The app's own rule (`StatusLine.tsx:6`) says such a region is not spoken. **Fix:** keep the region mounted and swap its text.
**Resolution:** Fixed. Both regions stay mounted and swap their text. Pinned by `AppBanners.test.tsx` and `SimpleRocketTool.test.tsx`.

### F42 | LOW | A part hidden through its parent is announced as shown | VERIFIED

`web/src/components/design/PartVisibilityToggle.tsx:33-48`: disabled, `aria-pressed=false`, label "Hide part". **Fix:** a label for the inherited case.
**Resolution:** Fixed. The locked button reads `tree.hiddenByParent` (all 10 languages). Pinned by `hiddenParts.test.tsx`.

### F43 | LOW | The undo and redo tooltips hard-code "(Ctrl+Z)" | VERIFIED

`web/src/components/layout/UndoRedoButtons.tsx:19, :28`. Wrong on macOS (Cmd) and for German keyboards (Strg). **Fix:** keyed shortcut text chosen by platform.
**Resolution:** Fixed. `edit.undoKeys` and `edit.redoKeys` in every language (Strg in German), and ⌘Z and ⇧⌘Z on Apple platforms (`isApplePlatform`). Pinned by `UndoRedoButtons.test.tsx`.

### F44 | LOW | A refused list write shows the raw text "storage-full" | VERIFIED

`web/src/services/storage/jsonListStore.ts:45` throws `new Error('storage-full')`; `components/design/MyMaterialsDialog.tsx:81, :109, :125`, `SavedPartsDialog.tsx:41`, `ComponentPicker.tsx:315`, `SavePartButton.tsx:55` and `SavedPartEditor.tsx:62` show it through `errorText`. `useCustomMaterialForm.ts:66` and `useMotorChoice.ts:84, :105` use `listWriteErrorText`. **Fix:** throw `KeyedError('storage.writeRefused')`.
**Resolution:** Fixed. `JsonListStore` throws `KeyedError('storage.writeRefused')`, so every `errorText` caller shows it in words; `listWriteErrorText` is gone. Pinned by `jsonListStore.test.ts` and the store tests.

### F45 | LOW | 24 published catalog rows carry a stand-in material where desktop's library has density 0 | VERIFIED (dump of the engine build)

`web/scripts/lib/nearestMaterial.mjs:2-9`, `sync-components.mjs:88-95`, `sync-preset-digests.mjs:89-92`. Re-checked against the engine build's own library after the move off 24.12: the same 24 parts still have a density-0 material. 7 paper streamers, 1 LDPE streamer, 1 light-ply engine block, 1 balsa nose cone and 14 parachute canopies. The `.ork` writer emits `<preset>` before the material (`exportParts.ts:124`), so the file's stand-in overrides desktop's preset: desktop weighs these at 0 g, the app at the stand-in. The choice is stated only in code comments. **Fix:** record it as a decision in `docs/CODE_QUALITY.md` with the row list, or keep desktop's values.
**Resolution:** Kept, and recorded in `docs/CODE_QUALITY.md` with the 24 rows: 14 parachutes and 10 component rows, read from the engine build's preset dump and the component sync.

### F46 | LOW | Two presets that tie on every matched field would get their digests by row order | REPORTED (no instance)

`web/scripts/sync-preset-digests.mjs:132-145`. `presetFor` matches on type, maker, part number and description, then the size gap; `sharedDigests` and `presetsWithoutRow` would not catch a swap. No two presets in the engine build's dump tie today. **Fix:** add thickness, shape, filled, shoulder sizes and mass to the gap, or refuse a tie.
**Resolution:** Open, by plan: no two presets tie today, and refusing a tie would also refuse the deliberate same-number duplicates `presetFor` spreads across rows. Take it up when the preset data next changes.

### F48 | MED | Constant gravity was written in a form desktop on the engine's commit ignores | VERIFIED

`web/src/services/files/ork/exportSimulation.ts:101-105` wrote `<gravitymodel>constant</gravitymodel><constantgravity>…</constantgravity>`, a form chosen for 24.12. The engine's OpenRocket reads only `<gravity model="constant"><value>…</value></gravity>` (`GravityHandler`, via `SimulationConditionsHandler.java:49`), which is also what its `OpenRocketSaver.java:402-409` writes, so a constant-gravity simulation opened in desktop with WGS gravity. `check:fields` compares no simulation's gravity, so no gate saw it.
**Resolution:** Fixed. The writer emits `OpenRocketSaver`'s element; the importer reads both forms. Pinned by `tests/services/flight/simOptionsExtras.test.ts` ("writes constant gravity as the element desktop writes and reads"), whose expected text is the saver's; not run against the unfixed code in a scratch copy. `check:fields` now compares each simulation's gravity model and, under constant gravity, its value (`OrkFields.java`, `orkDesktopSamples.test.ts`); the `conditions.ork` sample flies constant gravity, and a planted 9.5 against desktop's 9.79 was reported as a new difference.

### F49 | LOW | Automatic line and cord lengths were written as a number plus a tag desktop warns on | VERIFIED

`web/src/services/files/ork/exportWriters.ts:298-315` (`autoLengthXml`) wrote the flown length and `<linelengthauto>true</linelengthauto>` (or `cordlengthauto`) because 24.12 read `auto` as its default length. The engine's OpenRocket writes `<linelength>auto</linelength>` (`ParachuteSaver.java:29-32`, `ShockCordSaver.java:28-31`) and reads it back as automatic (`DocumentConfig.java:431-468`), and warned on the extra tag, so a saved chute opened with a fixed line length.
**Resolution:** Fixed. The writer emits `auto` for an automatic length; the three `KNOWN` warnings for the extra tag in `check-ork-opens.mjs` are gone. Pinned by `tests/services/design/autoRadius.test.ts` ("keeps an automatic shroud-line length as desktop writes it") and the `desktop` step (0 new, 2 known, 0 stale).

### F50 | MED | A RockSim shoulder was read open where desktop on the engine's commit reads it capped | VERIFIED

`web/src/services/files/rktImport.ts:239` left a `.rkt` shoulder without a cap because 24.12's shoulder length setters did not cap. The engine's OpenRocket caps a shoulder whose length leaves 0 (`Transition.setForeShoulderLength` and `setAftShoulderLength`), and its `NoseConeHandler` and `TransitionHandler` set nothing after, so a shoulder from a `.rkt` flew without its end cap's mass in the app. Confirmed by loading the test's RockSim document in the engine build: every shoulder came back capped.
**Resolution:** Fixed. The import caps a shoulder with a length, and a nose cone's base extension takes the cap with the shoulder, as `NoseConeHandler.addBaseExtension` does. Pinned by `tests/services/files/rktShoulderCap.kernel.test.ts` and the shoulder block of `rktDesktopParity.test.ts`.

### F51 | LOW | A document material's shear modulus was dropped on save | VERIFIED

`web/src/services/files/ork/docMaterials.ts` read the shear modulus from `<docmaterials>` and threw it away, then wrote the four-field form `TYPE|name|density|group`. The engine's OpenRocket writes `TYPE|name|density|shear modulus|group` (`Material.toStorableString`, from `OpenRocketSaver.saveDocumentPreferences`), so a design material's shear modulus was lost on a round trip.
**Resolution:** Fixed. `DocumentMaterial` carries `shearModulus`; the writer emits the five-field form; both material forms have a shear modulus box for bulk materials, as desktop's `CustomMaterialDialog` does (GPa metric, ksi imperial, from `UnitGroup.UNITS_SHEAR_MODULUS`); library materials keep it; a part takes it with its material, fillets and Settings defaults included; the built-in catalog carries unstable's values from `Databases.java`, and the drift gate compares them. Pinned by `tests/services/files/orkDocMaterials.test.ts`, `tests/services/materials/myMaterials.test.ts`, `MyMaterialsDialog.test.tsx` and `MaterialPicker.documentMaterials.test.tsx`.

### F52 | LOW | The 3D view draws a capped shoulder open | VERIFIED (against the Java)

`web/src/components/canvas/rocketPieces.ts` (`lathePoints`, `placeLathe`). A nose cone or transition shoulder is lathed into the part's shell with the part's wall, open at its end whether or not it is capped. Desktop's OBJ export closes a capped shoulder and uses the shoulder's own thickness (`TransitionExporter.addShoulder`). Found by F7's new cap flags (`KNOWN` in `geometryFlags.test.ts`). Flight is unaffected: the kernel adds the cap's mass.
**Fix:** close a capped shoulder's end in `shellGeometry`, give the shoulder its own wall, and remove the `KNOWN` entries.
**Resolution:** Fixed. The part's shell is drawn without its shoulders, and each shoulder is a tube of its own wall (solid on a filled part); a capped one is closed by a disc of that wall at its free end, where the kernel weighs the cap. The `KNOWN` entries are gone. Pinned by `Rocket3D.test.ts` and `geometryFlags.test.ts`.

`AUDIT_ENGINE.md` E1 (the "rail needed" figure is too short when the rod is shorter than the guide-to-aft distance, opt-in) is shown in the Simulations summary; it is counted there.

## 🟢 Dead code

### F47 | LOW | `fmtSi` is used only by its test, and the export-reach gate is fooled by a comment | VERIFIED

`web/src/prefs/units.ts:246`. knip counts the test import; `tests/repo/srcExportReach.test.ts:55` counts raw text, so the comment at `prefs/useUnits.ts:65` ("not units.ts `fmtSi`") counts as a use. A comment-stripped scan found no other unreferenced export beyond the baselined test seams. **Fix:** delete `fmtSi` and its tests, and strip comments before counting in `srcExportReach`.
**Resolution:** Fixed. `fmtSi` is gone. `srcExportReach` counts uses in code printed by TypeScript with its comments removed (a regex stripper misread `/\/*$/` as a comment). That found two more exports only tests used, both removed: `DISPLAY_NAME` (`tree/schema.ts`; the drawing tests take English names from `en.json`) and `KERNEL_MASSCOMPONENT_RADIUS`.

---

## Upkeep

Not counted above. Grouped by rule.

Status: all resolved except two kept on purpose. Design names take "Name (2)" in the library and simulation names "Name 2"; the three simulation copies now share `nextFreeName`. `numTag` stays: desktop's `DoubleSetter` with a separator also reads "1 2" as 2. `finiteNum` reads through `readDecimal`, `freshId` calls `uuid()`, the ISA ports all of `ExtendedISAModel` (`AUDIT_DUPLICATION.md` D10), and the three check scripts share `scripts/lib/previewCheck.mjs`. The `CODE_QUALITY.md` figures are refreshed from `npm run metrics`.

**A comment, doc or test title that states something untrue or out of date**

- `docs/AUDIT_PROMPT.md:27`: `web/eslint.config.js` "states the reason for each" test override; only `no-unnecessary-type-assertion` has one (`:121-127`), against `docs/DEVELOPER.md:100`. The axe view list omits the Flight card result view (scanned) and Benchtop (F5).
- `docs/CODE_QUALITY.md`: stale against `npm run metrics`: `TreeSchematic` 214 lines (now 231, `:164`); 35 disables (36, the new one at `components/common/useFilePick.ts:16` states a reason that holds); 20 non-size disables (21); 7,063 functions (7,128); 121 over complexity 15 (123); 110 over 100 lines (109); 150 catch blocks (152); repo checks in 8 files (9).
- `docs/DEVELOPER.md:106`: the trees the comment-history gate scans; it leaves out `website/src`, the web root config files, `web/index.html` and the workflows, which it does scan.
- `.github/workflows/gates.yml:54`: "`verify` runs the same three locally"; there is no `verify` script (`test:quick` is the local equivalent).
- `web/src/components/canvas/CenterView.tsx:26`: the lg+ `FlightWarnings` is rendered in `layout/AppPanes.tsx:123`, not `App.tsx`.
- `web/src/components/canvas/Rocket3D.tsx:62`: "framing ... keep using every piece"; `<Bounds fit clip observe>` (`:137`) wraps `shownPieces`, so first framing and every resize fit the visible parts only.
- `web/src/components/sim/MotorDialog.tsx:60`: the comment describes the `dia: loadDia()` seed at `:64`, not the line below it.
- `web/src/prefs/useUnits.ts:65`: names `fmtSi`, which nothing in `src` uses (F47).
- `web/src/services/flight/recoverySizing.ts:72`: `isaAt` reads the atmosphere "as the kernel's ExtendedISAModel reads them"; it caps geopotential at 20 km with two layers (`ExtendedISAModel.java:60-65` has eight to 84,852 m).
- `web/src/services/report/reportCsv.ts:15`: field names are "never localized"; `:82` builds one from `partLabel(i18n.t, s)`.
- `web/src/services/files/ork/numbers.ts:1`: `finiteNum` "avoids `Number(x)`'s traps"; it uses `Number`, which accepts "0x10", "0b1" and "0o7" that Java's `parseDouble` refuses (`numberText.ts` `readDecimal` refuses them).
- `web/src/tree/finPlanform.ts:360`: names `FinSet.getTabPointsWithRoot` and `generateContinuousFinAndTabShape`; it matches them only on a single-segment root.
- `web/src/tree/tubefins.ts:6`: omits that the bridge turns automatic back on when `outerRadiusAuto` is set (`ComponentFactory.java:604-615`); carried from the last run.
- `web/src/tree/schematicGeometry.ts:250`: implies the 85% fallback is what flies (F23).
- `web/src/services/exports/solidMesh.ts:297-298`: borrows the inner tube's wall for a keyless tube fin; the app resolves it from the parent's wall (`autoRadius.ts:637-643`).
- `web/src/tree/position.ts:123`: the `NOT_AFTER` comment omits `PodSet.java:98` and `ParallelStage.java:112` (F25).
- `web/src/engine/openRocketEngine.ts:48`: "JS wraps, WASM-GC traps"; both throw a `JavaError` (`AUDIT_ENGINE.md` E36).
- `web/scripts/sync-components.mjs:1`: "Desktop keeps every part, duplicates included ..., so this does too"; `uniqueRows` (`scripts/lib/partRows.mjs:17-27`) drops exact duplicates.
- `.github/workflows/sync-catalogs.yml:18-19`: materials held "by the extraction gate", which runs only by hand.
- The size disable on `components/design/MaterialPicker.tsx` gives "one select's option groups and its readout"; much of the complexity is resolving the current material and `handleSelect`.

**A duplicated helper, formula or list that has drifted**

- The local refresh recipe: `web/package.json:55` (`sync:all`) leaves out `check:digests`, which `.github/workflows/sync-catalogs.yml:13-15` runs.
- The committed `web/public/data` components file and manifest hold the pre-sort row order, `generated` 2026-10-15 and old hashes; dev builds and tests read them, so a local refresh rewrites the 1.87 MB file with no data change.
- `TYPE_STYLE.tag` in `components/canvas/schematicParts.tsx:270-280` is an English copy of the `schematic.tag.*` keys (F21).
- Unique-name generators with two formats: `uniqueName` (`state/fileSlice.ts`, "Name (2)") against `uniqueSimName` (`state/simSlice.ts:79-84`) and `simName` (`services/files/wireLoadedOrk.ts:86-89`, "Name 2").
- `LAUNCH_SI.hPa` (`prefs/launchUnits.ts:30-34`) hard-codes `*100` beside `UNITS.pressure` hPa (`prefs/units.ts:121`).
- `orkTree.freshId` (`services/design/orkTree.ts:4-8`) is a page-load counter whose ids persist in saved workspaces; `treeEdit.newId` (`:33-36`) states that a counter "restarts on page load while persisted ids remain, so ids could collide". No collision path today.
- `numTag` (`services/files/ork/importTags.ts:25-30`) takes the last whitespace token, so "1 2" reads as 2 where desktop refuses it.
- Three identical copies of `serve()` and the work-in-progress init script in `web/scripts/check-offline-data.mjs`, `check-offline-help.mjs` and `check-update-flow.mjs` (the `dupes` gate covers `web/src` only; none has drifted).
- The remaining duplication, including drift with no user-visible effect today, is in `docs/AUDIT_DUPLICATION.md`.

**A comment or test title that narrates history:** none found. The comment-history gate's scope gaps are in F3.

**User docs that state something the app does not do:** none found in the slices that read them.

## Recommended order of attack

1. **Done.** **Small verified fixes with a clear expected value.** F16 (one shared running-jobs list), F15 (`hasLocalCurve` in the grid), F12 (default site in the writer), F14 (desktop part names in `.rkt`), F22, F44, F32, F33, F43, F21, F18, F19, F37, F38, F39, F40, F17, F36, F42, F41. Each is a few lines; take the expected values from the kernel, desktop through `check:fields`, or the locale files.
2. **Done.** **F9 (launch documents).** A safety document; fix the per-mount count and add the two-mount test.
3. **Done.** **F1 with `AUDIT_ENGINE.md` E28 and E29.** Cap the instance product on both sides of the bridge and stop the radius passes early.
4. **Done.** **F10 (freeform editor).** Port the kernel's intersection test into the editor, held to the kernel through the bridge.
5. **Done.** **Kernel-sourced geometry: F23, F24, F25, F27, F20,** each with the case added to the generator or table it slipped past (F6, F7).
6. **Done.** **Desktop-file checks: F11, F13 and F4.** Narrow the `KNOWN` entries as each closes.
7. **Done.** **Gate scope: F3, F5, F8, F47** (and `srcExportReach`'s comment counting).
8. **Done.** **Smaller state and file defects: F29, F30, F31, F34, F35, F28, F52.**
9. **Done** (F46 waits, as planned). **Decisions to record rather than code: F26 (Scale) and F45 (catalog stand-in materials)** in `docs/CODE_QUALITY.md`, or change them to follow desktop. F46 when the preset data next changes.
10. **Upkeep done; of the duplication consolidations, every `DRIFT`, `DUP`, `BYPASS` and `HELPER` entry is resolved (a few in part, with reasons), and so are the `COMPONENT` extractions D122 to D135.** **Upkeep,** then the duplication consolidations in `docs/AUDIT_DUPLICATION.md`, deferring the large component extractions.
