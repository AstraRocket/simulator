# AUDIT_DUPLICATION - `web/` duplication and reuse audit

<!-- cspell:ignore jscpd gridline -->

Date: 2026-11-13. Branch `dev` at 228b0a2. Run per `docs/AUDIT_PROMPT_DUPLICATION.md`: eight parallel review agents (seven directory slices plus one cross-cutting sweep), then a coordinator pass that re-read the cited lines of every HIGH and MED finding and every `DRIFT`, re-resolved each citation by content, and merged findings that name the same copies.

Paths are as of 228b0a2 and are relative to `web/src` unless they start with `web/` or `engine-java/`. If a line does not match, search for the quoted expression.

Scope: `web/src`, excluding `engine/vendor/`, tests, locale JSON and CSS.

## How to read this

- **Categories.** `DRIFT`: copies that already disagree. `DUP`: copies that still agree. `BYPASS`: code that reimplements an existing shared helper. `HELPER`: inline logic that should be a named utility. `COMPONENT`: a repeated JSX or hook pattern that should be one shared component or hook.
- **Severity** follows the prompt: HIGH is any `DRIFT` a user can see, and any duplication of physics, unit conversion, file-format reading or writing, or persistence keys; MED is three or more copies, more than about 30 lines, or a component pattern in four or more places; LOW is two small copies that agree. "Narrow reach" means the difference needs a hand-edited or damaged file.
- **VERIFIED** means the coordinator re-read the cited lines and confirmed the claim independently of the slice agent (against the Java, for ported math). **REPORTED** means a slice agent read the copies and cited them, and no second reader re-read them.
- Ids restart at D1. The previous round's ids (2026-11-09, at 906513c) are cited as "old D*n*".

## Totals

| Category  | HIGH   | MED    | LOW    | Total   |
| --------- | ------ | ------ | ------ | ------- |
| DRIFT     | 10     | 1      | 6      | 17      |
| DUP       | 1      | 8      | 23     | 32      |
| BYPASS    | 0      | 6      | 28     | 34      |
| HELPER    | 0      | 0      | 3      | 3       |
| COMPONENT | 0      | 3      | 7      | 10      |
| **Total** | **11** | **18** | **67** | **96**  |

The HIGH and MED rows and every `DRIFT` are VERIFIED. The LOW `DUP`, `BYPASS`, `HELPER` and `COMPONENT` rows are REPORTED unless tagged otherwise.

## Mechanical baseline

jscpd 4 (the pinned version), token clones, `web/src` minus vendor, tests, JSON and CSS:

| Threshold            | Files | Clone pairs | Duplicated lines |
| -------------------- | ----- | ----------- | ---------------- |
| Gate (`.jscpd.json`) | 681   | 0           | 0 (0.00%)        |
| 30 tokens, 4 lines   | 699   | 78          | 488 (0.63%)      |

The last round measured 104 pairs and 654 lines (0.85%) at 30 tokens. As before, almost none of the HIGH findings show up in jscpd. Most of the 78 pairs were rejected as prop and type blocks, hook preambles, mirrored geometry (the calipers), per-format or per-type field tables, and thin `JsonListStore` wrappers. The rest led to D22, D29, D30, D45, D87 and D93.

## The previous round (old D1 to D135)

Every old entry was re-checked against the current code.

**Fixed and still fixed (old ids):** D1 to D9, D11 to D15, D17 to D23, D26 (the axis rule), D28 to D47, D49 to D61, D63 to D94, D96, D98 to D103, D105 to D113, D115 to D120, D122 to D135. Kept on purpose and unchanged: D38, D47, D76, D90, D100 (`layStages`), D88 (the two zoom wirings). Old D15 leaves one literal (`'Camera shroud'` in `ork/exportWriters.ts`) that no other writer needs, so it is not reported.

**Still open in part, reported again under new ids:**

| Old id | What is left                                                                 | New id   |
| ------ | ---------------------------------------------------------------------------- | -------- |
| D2     | The fix patched the one site; the formatter lambda is still copied four times | D20      |
| D5, D21| `fmtCalibers` was proposed and never added; the caliber text drifts in pl/ru  | D8       |
| D10    | The ISA constants and the geopotential conversion are still copied            | D18      |
| D16    | Bare `Number()` in the `.ork` reader                                          | D74      |
| D24    | The simple rocket's placeholders are still built by hand                      | D60      |
| D25    | The tube fin collision's parent radius is rebuilt by hand                     | D29      |
| D26    | The proposed `scaledSamples` half was not done                                | D31      |
| D27    | The `.ork` pad wind heading is stored unreduced                               | D15      |
| D48    | The landing estimator's ground elevation in the global unit                  | D13      |
| D62    | `finiteOr` and `isFiniteNumber` still hand-written at about 25 sites          | D51      |
| D95    | `motorSpec.ts`'s `motor.length / 2000`                                        | D75      |
| D97    | `isRecord` still hand-written at 18 sites                                     | D50      |
| D104   | `settings.ts` reads and parses its own key twice                              | D22      |
| D114   | `fmtDegrees`' digit rule hand-rolled twice                                    | D63      |
| D121   | The fairing's `points` string built by hand                                   | D81      |

**The 2026-10-05 round:** still fixed. There is one `Stat` (`components/common/Stat.tsx`), `finTabFrontEdge` lives only in `tree/finPlanform.ts`, and the remaining local `num` and `round` names are XML element readers built on `finiteNum`, thin wrappers over the shared helpers, or formatters, not node readers. The `catalogPatch` guard is still in place (`web/tests/services/parts/catalogPatch.kernel.test.ts`, "a stated catalog mass", 0.5%), so `web/scripts/lib/presetVolume.mjs` stays out of scope.

---

## DRIFT

### D1 | HIGH | VERIFIED | Flight figures in the global unit in four views, scoped everywhere else

- **Copies (global):** `components/canvas/FlightPath3D.tsx:75-76` (`u.fmtSym('distance', alts[idx] ?? 0)`, the HUD); `components/canvas/flightChartTraces.ts:29` (`const ALTITUDE: Meta = { ... quantity: 'distance' }`, scaled and labeled through `traceScale` and `traceUnit` with the global `u`); `components/sim/FlightCard.tsx:176-198` (`u.fmtSym('distance', flight.maxAltitude, 0)`, the velocities, rod length, rod angle, wind, charge mass); `components/sim/MotorGuideDialog.tsx:321-330` (`{ id: 'apogee', ..., quantity: 'distance' }`), rendered by `GuideResults.tsx:40` (`u.fmt(c.quantity, v)`).
- **Copies (scoped):** `canvas/EnvironmentView.tsx:54` (`u.at(unitScope('sim', 'apogee'), 'distance')`), `sim/SimSummary.tsx:34-37, :130-133, :208`, `layout/useSimSummary.ts`, `sim/SimulationsTable.tsx:92-96`, `sim/LaunchRodSection.tsx`, `sim/WindSection.tsx`, `sim/RecoveryChargesCard.tsx`.
- **Drift:** with the Apogee chip in ft and the global unit in m, the Apogee tile, the table and the Environment view read ft while the 3D HUD, the Altitude chart panel, the printed flight card and the motor guide table read m on the same Results tab. The scoped copies are right: old D3 and D4 settled that a chip is the reader's choice for that figure, and `FlightCard.test.tsx` says the card prints "in the units the launch panel uses".
- **Fix:** one `SIM_FIGURE` table (`apogee`, `rodExit`, `maxSpeed`, `maxAccel`, `landing`, `deployVelocity`, `downrange` to quantity) and `simFigureUnit(u, key)` in `components/sim/launchSection.ts` beside `siteAltitudeUnit`, plus `launchFieldUnit(u, field)`; `Meta.scope?` in `flightChartTraces.ts` read by `traceScale`, `traceOffset` and `traceUnit`. The 18 hand-built `unitScope('sim', ...)` strings (stored chip keys) then come from one table. ~10 lines net. The flight CSV and guide CSV are files and may stay global.

### D2 | HIGH | VERIFIED | Launch documents count a grounded booster

- **Copies:** `services/flight/powerClass.ts:34-54` `seatedMotors` (`if ((n.type === 'stage' || n.type === 'parallelstage') && ... grounded.has(n.id)) continue;`) and `flightConfigs.ts` `flyingMountIds` against `services/flight/launchDocs.ts:78-81` (`stageNodes(tree)...filter(({ stage }) => !grounded.has(stage.id as string))`, then `count: copies.get(mount.id as string) ?? 1`) and `services/motors/exhaust.ts:119` `burnExhausts` (`for (const stage of [...stageNodes(tree)].reverse())`, no grounded check).
- **Drift:** `stageNodes` returns top-level stages only (`treeWalk.ts:108-109`), but the configuration panel grounds boosters too (`configSlice.ts` toggles ids from `findStages`, which includes `parallelstage`). A grounded booster's motors stay in the launch documents with count 1 (the `copies` map has no entry for them), their impulse adds to installed impulse, the impulse class and the certification level, and its recovery devices are listed; the power class check skips them. `burnExhausts` skips no grounded stage, so a grounded stage still takes a flame slot in the 3D flight. `seatedMotors` is right: the kernel's `_setStageActive` takes boosters out with their stage. `launchDocs.test.ts` covers only a grounded top-level stage.
- **Fix:** export one `isFlying(tree, config): (id) => boolean` (or `flyingNodes`) from `powerClass.ts`; `launchDocs` builds `motors` from `seatedMotors`, filters devices through the same walk, and `burnExhausts` filters stages through it. ~15 lines. Pin with a grounded booster.

### D3 | HIGH | VERIFIED | The material picker silently replaces a same-named library material

- **Copies:** `components/design/useCustomMaterialForm.ts:61` (`const next = await addCustom(name, type, si, group, shearModulus);`) against `services/materials/myMaterials.ts:50-56` (`throw new KeyedError('errors.material.nameTaken', ...)`). The store path: `materials.ts` `addCustom` to `materialStore.ts:42-43` (`this.items.upsert([...])`, keyed by name and type) to `jsonListStore` `upsert`, which replaces the entry.
- **Drift:** My Materials refuses a library name already used for that type; the picker's inline form overwrites the stored density, shear modulus and group, and every design that later picks the name gets the new density. `saveMaterial` is right; its own comment says "a save under another's name would overwrite it". The two forms also list groups differently (`CustomMaterialForm.tsx` `groupsOf(mats)` against `MaterialEditor.tsx` `groups(type)` plus the current group).
- **Fix:** move the taken-name check into `addCustom(..., { replacing? })`, or have the picker call `saveMaterial`. ~4 to 15 lines.

### D4 | HIGH | VERIFIED | The flight path export puts a half-cleared site at latitude 0

- **Copies:** `services/exports/flightPath/buildModel.ts:85-87, :126-127` (`const lat0 = unset ? EXPORT_FALLBACK_LATITUDE : (launch.latitudeDeg ?? 0);`) against `services/files/ork/exportSimulation.ts:94-95` (`launch.latitudeDeg ?? KERNEL_LAUNCH_SITE.latitudeDeg`) and the bridge (`OpenRocketEngine.java`, `JsonLite.dbl(o, "launchLatitude", 28.61)`; a null reads as the fallback).
- **Drift:** a cleared field is `null` per axis. With only latitude cleared, the kernel flies at 28.61 and the `.ork` writes 28.61, but the KML, GPX and CSV path export places the pad at latitude 0. With latitude 0 and longitude cleared, the "both zero" rule moves the export to the Cape. The "both zero" rule itself is stated on purpose; the per-axis `?? 0` is the drift. The kernel and `exportSimulation` are right: the export must show where the flight was flown.
- **Fix:** `resolvedSite(launch)` beside `launchPositionUnset`: each axis `?? KERNEL_LAUNCH_SITE.*` first, then the "both zero" rule on stated values. ~2 lines. Pin with a `buildModel` test.

### D5 | HIGH | VERIFIED | The aft view draws a centered bore on a clustered automatic ring

- **Copies:** `components/canvas/aftScene.ts:330-338` `drawDisc` (`const rings = disc.innerR > 0 ? [disc.outerR, disc.innerR] : [disc.outerR];`, from `discDims` alone) against `services/design/discGeometry.ts:118-130` (`ringHoles`) and `:195-204` `resolveDisc` ("`holes`, when set, replaces the centered bore"), used by `canvas/rocketPieces.ts` (`d.holes ? holedRingGeometry(...)`), `exports/rocketPrintExport.ts`, `files/onshapeExport.ts` and `exports/dxfExport.ts` (`ringHolesIn`).
- **Drift:** `syncAutoRadii` (`autoRadius.ts:666-667`) stores `innerRadius = ringBore(...)`, the widest tube radius, centered. The aft view draws that centered circle beside the dashed motor tubes at their offsets, where no hole exists; the 3D view, 3MF, Onshape and DXF all cut one hole per cluster place. The `ringHoles` copies are right.
- **Fix:** `drawDisc` takes the hole list (`ringHoles(ring, parent, pStart)`) and draws one dashed circle per hole through `toAftFrame`, `innerR` only when `holes` is null. About +4 lines. Add an aft test with a cluster.

### D6 | HIGH | VERIFIED (narrow reach) | The bore field reads raw keys beside fields that read kernel defaults

- **Copies:** `components/design/DimensionFields.tsx:199-216` `boreProps` (`const outerR = num(node, 'outerRadius');`, `num(node, 'thickness')`) against `services/design/fieldRange.ts` `fieldValue` and `absentValue` (falls back to `KERNEL_DEFAULTS[type]`; body tube 25 mm and 2 mm), which the OD and wall fields beside it show.
- **Drift:** on a tube with no `thickness` or `outerRadius` key, Diameter and Wall show the kernel's values while Bore reads 0 or the full OD, and typing a bore writes `thickness: 0` from a 0 outer radius. Reachable through a `.rkt` with no `ID` tag (`rktImport.ts` skips an undefined wall) and hand-edited JSON. `fieldValue` is right; `fieldReadback.kernel.test.ts` holds it to the kernel.
- **Fix:** read the OD and wall through `fieldValue`. ~2 lines.

### D7 | HIGH | VERIFIED (narrow reach) | The motor card's "has a curve" test

- **Copies:** `components/sim/MotorRow.tsx:48` (`const hasCurve = !!motor?.masses?.length;`) against `services/motors/motorCurve.ts:53` `hasUsableCurve` (at least the minimum samples and no `curveProblem`), used by `buildRocket.ts`, `runnability.ts` ("Must match the builder's predicate"), `loadOrk.ts`, `flightConfigs.ts` and `MotorGuideDialog.tsx`.
- **Drift:** an `.ork` whose embedded motor has one sample, mismatched arrays or all-zero masses shows as a normal motor with the curve button and no "motor not found" line, while the builder skips it and Run refuses it. `hasUsableCurve` is right.
- **Fix:** `const hasCurve = hasUsableCurve(motor)`. 1 line.

### D8 | HIGH | VERIFIED (cosmetic) | Stability in calibers: two locale keys and five hand-joined copies (old D5, D21 leftover)

- **Copies:** `tools/SimpleResults.tsx:105` (`t('simpleTool.calibers', { value: fmtNum(fig.railStability, 2) })`) against `${fmtNum(x, 2)} ${t('stability.caliber')}` at `sim/FlightCard.tsx:132`, `sim/FlightEventsTable.tsx:27`, `layout/simSummaryReadouts.tsx:15`, `services/report/pdfPage.ts:375`, `tree/schematicGeometry.ts:296`.
- **Drift:** pl reads "1,50 kal." in the simple tool and "1,50 kal" elsewhere; ru "кал." against "кал" (`pl.json`, `ru.json` `simpleTool.calibers` against `stability.caliber`). A non-finite margin reads as the no-value dash plus "cal" through `stabilityReadout`, a bare dash on the flight card (its own guard), and nothing on the schematic overlay (`marginText` returns null). One key and one rule is right; the dash plus the unit matches `fmtSymIn` for every other unit readout.
- **Fix:** `fmtCalibers(cal, t, digits = 2)` in `i18n/format.ts` beside `fmtPercent`, on `stability.caliber`; drop `simpleTool.calibers`. ~8 lines plus locale churn. Formatting only; the figure stays the kernel's.

### D9 | HIGH | VERIFIED (narrow reach) | Fin count read four ways

- **Copies:** `components/design/ComponentTree.tsx:96` (`const c = n.finCount ?? n.count;`, raw, no rounding), `services/design/componentActions.ts:59` `splitCount` (`countOf(node, spec.count, 1)`), `services/files/rasaero/surface.ts:64` (`num(node, 'finCount', 3)`, unrounded) against `countOf(n, 'finCount', <kernel default>)` at about 18 sites with four default sources: literals 3 and 6 (`canvas/aftScene.ts:159, :230`, `canvas/rocketPieces.ts:239, :303`, `canvas/schematicPainter.tsx:130`, `rktImport.ts`, `rasaero/sustainer.ts:62`), `COMPONENT_DEFAULTS.finset` (`dxfExport.ts:94`, `ork/exportWriters.ts`), `KERNEL_DEFAULTS` (`tree/tubefins.ts:14, :50`, `finTabAuto.ts:19`, `onshapeExport.ts`, `rktExport.ts:336`) and `kernelDefault(type) ?? 3` (`rktExport.ts:280, :579`, `markingGuide.ts:91`, `reportGeometry.ts:28`).
- **Drift:** on a keyless fin set the kernel flies 3 planar or 6 tube fins; the tree row shows no count and Split is disabled (count 1). Imports always set `finCount`, so only a hand-written workspace reaches it. The `KERNEL_DEFAULTS` readers are right. `importLimits.ts:59, :61` mirror the bridge's own literals and stay.
- **Fix:** `finCountOf(node)` in `tree/nodeProps.ts` (`countOf(node, 'finCount', kernelDefault(node.type, 'finCount') ?? 3)` capped at `MAX_FIN_COUNT`); `splitCount` reads `kernelDefault(type, spec.count)`. ~10 lines.

### D10 | HIGH | VERIFIED (no visible difference) | "Is this a usable shear modulus", six copies

- **Copies:** `services/storage/settings.ts:366` (`... && m.shearModulus > 0`) against `>= 0` at `services/materials/materialTypes.ts` `isShearModulus`, `services/files/onshapeExport.ts:179-180` `shearOf`, `services/files/ork/exportParts.ts:54-55` `shearModulusAttr`, `services/files/ork/importTags.ts:107-108, :170-171`.
- **Drift:** a default material stored with 0 loads back from settings with no modulus, so the `.ork` writer omits the attribute it would otherwise write as `shearModulus="0"`. 0 and absent both mean "unset" (desktop's `inPlaneShearModulus`), so nothing changes on screen or in flight; HIGH because it is persistence and file-format logic in six places. `>= 0` is right.
- **Fix:** `shearModulusOf(v): number | undefined` in `materialTypes.ts`. ~10 lines.

### D11 | MED | VERIFIED | A missing ground position: zeroed in two readers, skipped in two

- **Copies:** `components/canvas/flightScene.ts:124-125` (`east: Number(px[i]) || 0, north: Number(py[i]) || 0`) and `services/exports/flightPath/buildModel.ts:288-289` (`const eastAt = (i: number) => finiteOr(east?.[i], 0);`, used for event waypoints, the landing and the max distance) against `services/flight/groundTrack.ts:33` `trackPoints` (`if (isFiniteNumber(e) && isFiniteNumber(nr)) out.push(...)`, "zero is the pad, so one null would draw a spike to it") and `buildModel.ts:452` `pushPoint` (skips a non-finite sample).
- **Drift:** a null `Px` or `Py` at one sample draws the 3D path out to the pad and back, and puts an export waypoint at the pad, while the ground track and the path drop it. Dropping is right, by both copies' own comments. Visible only on a non-finite mid-flight sample (NaN becomes null in persisted results).
- **Fix:** `groundPointAt(series, i): GroundPoint | null` in `groundTrack.ts`, used by all four; event positions take the nearest finite sample. ~6 lines.

### Low drift

| Id  | Tag | Copies | Drift | Fix |
| --- | --- | ------ | ----- | --- |
| D12 | VERIFIED | `components/canvas/AeroCharts.tsx:84-102` (`const cur = hoverM ?? machs[0]!;`) against `canvas/useChartCrosshair.ts:9-27` (`next = (hoverT ?? t1) - step`) | With no crosshair, ArrowLeft enters the flight chart from the right end and the aero chart stays on the first sample. Where focus enters, not a wrong figure. The sample stepping in aero is intended. | `hoverM ?? machs[machs.length - 1]` on ArrowLeft; a `samples` option on `useChartCrosshair` (~20 lines) is borderline. |
| D13 | VERIFIED | `components/tools/LandingParts.tsx:105` (`const dist = u.plain('distance')`) and `:128` against `canvas/EnvironmentLanding.tsx`, `canvas/GroundTrack.tsx` (`unitScope('sim', 'downrange')`) and the tool's own `SiteElevationField` (old D48) | Ground elevation at landing in the global unit beside a site field in the `launch.altitude` scope. The distances may stay global by intent. | `siteAltitudeUnit(u)` for the elevation. ~2 lines. |
| D14 | VERIFIED | `components/config/configColumns.tsx:30` (`fmtUpTo(s, 3)`) against `config/DeploymentSection.tsx:73`, `config/SeparationSection.tsx:78` (`fmtUpTo(..., 2)`) | A 1.125 s delay reads "+1.125 s" in the table and "1.13" in the field placeholder. | 3 digits in both. |
| D15 | VERIFIED | `services/files/ork/importLaunch.ts:116` (`launch.windDirectionDeg = radToDeg(dirRad)`) against `windFrom` at `:125-128` (old D27) | A hand-edited 7 rad pad heading shows as 401°; `PinkNoiseWindModel.setDirection` reduces it. Desktop files are already reduced. | `norm360`. 1 line. |
| D16 | VERIFIED (against the Java) | `tree/position.ts:31-41` `normalizeFreeformPoints` (`const moved = p0[0] !== 0 \|\| p0[1] !== 0;`) against `services/design/finOutline.ts` `asKernelSees` and `FreeformFinSet.java:280` (`IGNORE_SMALLER_THAN < delta.length2()`, 1e-12) | `position.ts` moves the outline for any non-zero first point; the Java and `finOutline` only past 1e-12 squared. Sub-micrometer. | `normalizeFreeformPoints` uses the threshold; `asKernelSees` calls it. ~8 lines. |
| D17 | VERIFIED (against the Java) | `tree/nodeProps.ts:77-100` `CONSTRUCTOR_METHOD` (no body tube, nose cone, transition or stage, so `'top'`) against `services/design/autoRadius.ts:73-83` `partOf` (`'after'`) and `BodyComponent.java:29` (`super(AxialMethod.AFTER)`) | An unplaced body part reports `top` in `positionOf` (read by `PlacementSection`, `rktExport.ts:164` and others); the kernel says `after`. Chain parts stack regardless, so only the shown or written method differs. Old D47 kept the two readers apart on purpose; this is the table gap, not the split. | Add the four types as `after` to `CONSTRUCTOR_METHOD`, with a kernel parity case. |

## DUP

### HIGH

| Id  | Tag | Copies | What | Home and signature | Lines |
| --- | --- | ------ | ---- | ------------------ | ----- |
| D18 | VERIFIED | `services/flight/recoverySizing.ts:11, :14` (`const R_AIR = 287.053;`, `const P0 = 101325; // Pa`), `:61` (`const toGeometric = (geo: number) => (ISA_EARTH_RADIUS_M * geo) / ...`); `services/flight/finFlutter.ts:18-22` (`GAMMA`, `R_AIR`, `P0`); `services/map/geodesy.ts:10` `geometricFromGeopotential`; `services/files/ork/exportSimulation.ts:154-155` (`?? 15`, `?? 1013.25`) (old D10 leftover) | The ISA constants and the geopotential conversion. No drift today. The kernel facade gives only `standardPressurePa` (no temperature, null before load), and flutter needs temperature, so the app port stays and should be the one source. | Export `R_AIR`, `P0`, `T0`, `speedOfSound(tK)` from `recoverySizing.ts` (or a `services/flight/isa.ts`); `toGeometric` becomes `geometricFromGeopotential`; `KERNEL_ISA` in `tree/kernelDefaults.ts` for the writer | ~8 |

### MED

| Id  | Tag | Copies | What | Home and signature | Lines |
| --- | --- | ------ | ---- | ------------------ | ----- |
| D19 | VERIFIED | `components/sim/SimulationsPane.tsx:56`, `sim/SimulationsTable.tsx:146` (`simStatus(s, runs, tree, isOutdated(s, tree, configOf(configs, s), simPrefs))`), `canvas/CenterToolbar.tsx:13`, `layout/useSimSummary.ts:29`; the stale filter at `SimulationsPane.tsx:43` and `state/runSlice.ts:153`; the shown summary at `useSimSummary.ts:34`, `SimulationsTable.tsx:148`, `state/exportSlice.ts:93-94` | A sim's status, staleness and shown summary | `simStatusIn(sim, { simRuns, tree, configs, simPrefs })`, `staleSimIds`, `shownSummary(sim)` in `services/flight/simulations.ts` | ~10 |
| D20 | VERIFIED | `canvas/DesignWarnings.tsx:24`, `sim/FlightWarnings.tsx:33`, `sim/MotorGuideDialog.tsx:413`, `sim/SimulationsTable.tsx:39` (`warningText(..., (q, si) => u.fmtSym(q, si))`) (old D2) | The reader-unit formatter for kernel warnings, the slip old D2 fixed at one site | `useWarningText(t)` beside `warningText` | ~6 |
| D21 | VERIFIED | `services/flight/runPlan.ts:34`, `state/driftSweepSlice.ts:57`, `state/motorGuideSlice.ts:58, :76` (`unflyable(sim, primaryMotor(...), configPowerClass(...))`), `components/sim/RunButton.tsx:33-37` | "Can this sim fly on this tree and configuration" | `simUnflyable(sim, tree, config, dryMassKg)` in `services/flight/runnability.ts` | ~10 |
| D22 | VERIFIED | `try { JSON.parse(raw) ... guard ... } catch { fallback }` at `services/storage/jsonListStore.ts:7, :45`, `designLibrary.ts:116, :186`, `bayStore.ts:79`, `workspaceJournal.ts:39` (raw localStorage), `settings.ts:325, :534` (raw `localStorage.getItem(KEY)`, old D104), `localPref.ts:14` | Parse a stored string with a guard and a fallback | `parseJsonOr(raw, valid, fallback)` in `services/storage/localPref.ts`, `readLocalJson` built on it | ~25 |
| D23 | VERIFIED | Own trimmed name: `i18n/format.ts:81, :89` (`stageLabel`, `partLabel`), `config/partName.ts:8`, `services/app/appInfo.ts:52`, `files/importNote.ts:30`, `report/reportModel.ts:352`, `design/SavePartButton.tsx:31`, `exports/rocketPrintExport.ts:55` | Reading a node's own name. `stageLabel` treats the kernel's bracketed default (`isDefaultComponentName`) as no name and the others do not; no path was found that gives a part such a name, so this is filed as a `DUP`. `warningText.ts:45` returns it untrimmed on purpose (it mirrors `RocketComponent.setName`). | `ownName(n)` in `tree/nodeProps.ts` beside `str` | ~10 |
| D24 | VERIFIED | `canvas/aeroTables.ts:89-95` `nearestSampleIndex`, `canvas/flightScene.ts:150-161` `idxAt`, `exports/flightPath/buildModel.ts` `indexOfTime` (reads a null time as 0), `sim/SimEditor.tsx:156` `nearestStepIndex`, `flight/motorGuide.ts` `nearestDelay` | The index of the nearest sample (first wins a tie in all) | `nearestIndex(xs, x, n?)` in `services/flight/interpolate.ts` | ~25 |
| D25 | VERIFIED | `canvas/FlightChart.tsx:63, :68`, `canvas/FlightChartEvents.tsx:40`, `canvas/FlightPathScene.tsx:157` (`t(EVENT_LABEL[type] ?? type)`) | An event's chart label with its raw-type fallback | `eventLabel(t, type)` beside `EVENT_LABEL` | ~0 net |
| D26 | VERIFIED | `canvas/useChartSeries.ts:40`, `sim/motorColumns.ts:166`, `sim/FlightCsvDialog.tsx:45` (`prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]`) | Toggling an item in an ordered list (`collections.ts` has only the `Set` form) | `toggledItem(list, item)` in `services/app/collections.ts` | ~0 net |

### LOW

| Id  | Copies | What | Home |
| --- | ------ | ---- | ---- |
| D27 | `components/canvas/rocketPieces.ts:101-105, :136` `holedRingGeometry`, `services/exports/solidMesh.ts:257-262` `ringSolid` | A ring with motor holes in the kernel y/z frame (`absarc(-h.z, h.y, ...)`, then `rotateY(Math.PI / 2)`); only the segment count differs, on purpose | `holedRingShape(outerR, holes)` in a light `services/design/ringShape.ts` (not `solidMesh.ts`, which stays out of the main bundle) |
| D28 | `state/simSlice.ts:146-158` `duplicateSim`, `state/motorGuideSlice.ts:138-148` `promoteGuideRow` | Name, `newSimulation`, `insertAfter`, select | `copySim(src, name, configId)` in `services/flight/simulations.ts` |
| D29 | `tree/finPlanform.ts:211-219` `finMountOf`, `:400-409` `parentRadiusOf`, `components/design/useSelectedComponent.ts:24-29` (old D25) | A hand walk equal to `findWithParent(tree.components, id)`, and the parent radius rebuilt by hand | `findWithParent`; `parentRadiusOf(tree, id) ?? 0` |
| D30 | `services/files/rasaero/sustainer.ts:34-42`, `tree/finPlanform.ts:83-90` `finPlanformArea` | A shoelace area (plus a centroid moment in the RASAero copy), both on `finPlanformPoints` | `finPlanformMoments(pts)` in `finPlanform.ts` |
| D31 | `canvas/flightChartTraces.ts:131-157` `panelSeries`, `canvas/FlightXYPanel.tsx:52-86` (old D26) | Gather finite samples, scale, clip at `clipT`, track min and max | `scaledSamples(...)` in `flightChartTraces.ts` |
| D32 | `tools/SimpleResults.tsx:54-57`, `tools/SimpleMotorGuide.tsx:208-211` | The simple tool's limits object | `simpleLimits(sim)` in `simpleRocket.ts` |
| D33 | `services/flight/recoveryCharges.ts:104-105`, `flight/recoveryBays.ts:150-151` | Primary and backup charge mass | `chargePair(charges)` |
| D34 | `services/flight/simDiff.ts:5-13`, `weather/weatherSource.ts:66` | Equality through `stableJson` (NaN differs; unreachable) | `sameValue(a, b)` in `services/app/stableJson.ts` |
| D35 | `services/flight/windLevels.ts:80-83`, `landing/descentDrift.ts:52-55`, `flight/driftEllipse.ts:104-106` | A bearing to an east/north vector, the inverse of `bearingFromPad` | `pointAtBearing(distance, deg)` in `groundTrack.ts` |
| D36 | `services/app/localDate.ts:2-6` `localToday`, `weather/openMeteo.ts:91-95` `ymdInZone`; `/^\d{4}-\d{2}-\d{2}$/` at `tools/LandingEstimator.tsx:48`, `app/remoteData.ts:92`, `files/ork/orkDesignNotes.ts:15` | Today as YYYY-MM-DD and the check for one | `ymdInZone` and `isYmd` in `localDate.ts` |
| D37 | `services/files/rktExport.ts:43-46, :275`, `rktImport.ts:38-41, :368-369` | RockSim unit factors and the fin shape code | `rocksim/schema.ts` beside the other code tables |
| D38 | `services/report/reportCsv.ts:28-50`, `report/pdfPage.ts:366-388` (old D38 remainder) | Digits per stat key (labels differ on purpose) | `STAT_DIGITS` beside `staticInfoRows` |
| D39 | `services/files/onshapeExport.ts:133, :233-235`, `tree/placement.ts:6, :11` | The line-instanceable type set and its count | `lineInstanceCount(node)` from `tree/placement.ts` |
| D40 | `services/storage/settings.ts:509-513`, `flight/flightColumns.ts:142-153` `defaultCsvFormat`, `sim/FlightCsvDialog.tsx:32, :183` | The flight CSV format defaults and the `\t` normalization | `DEFAULT_SETTINGS.flightCsv` |
| D41 | `canvas/TreeSchematic.tsx:32, :105`, `canvas/AftView.tsx:15, :58` | `WHEEL_ZOOM` options, the same at `useWheelZoom`'s only two callers | Read the constants inside `useWheelZoom` |
| D42 | `canvas/TreeSchematic.tsx:108-110`, `canvas/SchematicPreview.tsx:38-40`, `sim/ExhaustPreview.tsx:20` | `useId().replace(/:/g, '')` (a no-op in React 19.3) and the label callbacks | Drop the replace; optional `useSchematicLabels()` |
| D43 | `canvas/Rocket3D.tsx:67-68, :74`, `canvas/useRocketExport.ts:38-39`, `canvas/SchematicControls.tsx:67` | Canvas CSS size; the image-failed message | `canvasCssSize(el)`, `imageFailed(t, e)` |
| D44 | `services/files/ork/embeddedMotors.ts:21-29` `rowsDigest`, `motors/rseParser.ts:144-159` `desktopDigest` | Sort, finalize and hash a curve; guarded by `motorDigest.test.ts` | `rseRowsDigest(rows, calc)` in `motorDigest.ts` |
| D45 | `engine/simClient.ts:128-132, :143-147` | Drop a worker slot | A local `dropSlot` |
| D46 | `layout/PaneSplitter.tsx:45, :104` | The effective maximum width | A local `room(w)` |
| D47 | `canvas/schematicParts.tsx:93`, `canvas/rocketPieces.ts:246` | A fin set's axial start beside `finPlacement` | `finPlacement` returns `start` |
| D48 | `sim/warningTone.ts:2-3`, `common/Notice.tsx:4-7` | The warn and danger tone classes | One exported tone table |
| D49 | `sim/chartAxes.tsx:11-18` `ChartDims`, `common/chartAxes.tsx:34-41` `PlotFrame`; `LegendSwatch` in `sim/` used by `canvas/` | The chart frame type and the swatch | `PlotFrame` and `LegendSwatch` in `common/chartAxes.tsx` |

## BYPASS

| Id  | Sev | Tag | Copies | Helper it should call |
| --- | --- | --- | ------ | --------------------- |
| D50 | MED | VERIFIED | `!v \|\| typeof v !== 'object'` at 18 sites: `engine/openRocketEngine.ts:91`, `i18n/keyedError.ts:66`, `prefs/units.ts:260, :271`, `services/design/appearance.ts:62`, `design/figureStyle.ts:34, :37`, `files/ork/orkDesignNotes.ts:10, :32`, `flight/atmosphereLevels.ts:8`, `parts/componentDb.ts:179, :255`, `storage/designLibrary.ts:36, :39, :56`, `storage/flyer.ts:38, :43`, `weather/weatherSource.ts:90`; `parts/presetStore.ts:35-37` (old D97) | `isRecord`; keep the guards that accept arrays on purpose (`importNote.ts`, `componentDb.ts:262`) |
| D51 | MED | VERIFIED | `Number.isFinite(v) ? v : fb` and `typeof v === 'number' && Number.isFinite(v)` at about 25 sites, among them `canvas/FlightChart.tsx:59`, `canvas/flightScene.ts:123, :140`, `design/DimensionFields.tsx:153`, `design/OverridesSection.tsx:69`, `services/design/appearance.ts:66-67`, `design/autoShoulder.ts:124-125`, `flight/windSweep.ts:63, :104`, `tree/finPlanform.ts:109, :133, :223`, `storage/settings.ts:42, :407`; `flight/requiredLaunch.ts:18` `isFilled` and its callers (old D62) | `finiteOr`, `isFiniteNumber`, `numOpt` |
| D52 | MED | VERIFIED | Roll angle read by hand: `canvas/aftScene.ts:283, :295`, `canvas/rocketPieces.ts:331, :349`, `canvas/schematicParts.tsx:245`, `files/onshapeExport.ts:211-222`, `files/ork/exportWriters.ts:267-269, :281-282`, `report/markingGuide.ts:90` ("must match rocketPieces.ts and exportWriters.ts"), `tree/position.ts:89` | `rollAngleOf` (`tree/componentKinds.ts:91`), reading `KERNEL_DEFAULTS` in place of its own `Math.PI` |
| D53 | MED | VERIFIED | `sim/LocationEditor.tsx:46`, `sim/LocationsDialog.tsx:24`, `sim/PlaceSearchDialog.tsx:56` (`u.at(unitScope('launch', SITE_ALTITUDE_FIELD), LAUNCH_SI.distance.q)`) | `siteAltitudeUnit(u)` (`sim/launchSection.ts:20`) |
| D54 | MED | VERIFIED | Disclosure by hand: `canvas/LoadedBanner.tsx:55-67`, `sim/MotorFilterBar.tsx:225-231`, `sim/SafetyCard.tsx:29-39` (the rotating › that old D126 replaced) | `common/Disclosure.tsx` with a `glyphAfter` option |
| D55 | MED | VERIFIED | The name prompt mounted by hand: `layout/HeaderDialogs.tsx:59`, `layout/DesignLibraryDialog.tsx:107`, `sim/LocationPicker.tsx:142` (`<DesignPropertiesDialog`); `common/PromptDialog.tsx` imports it from `layout/` | `prompt()` from `promptStore`; move the dialog to `common/NamePromptDialog.tsx` and add `duplicateText` to `PromptOptions` |
| D56 | LOW | REPORTED | `design/ComponentPicker.tsx:303-314` | `removeWith` (as `SavedPartsDialog` does for the same delete) |
| D57 | LOW | REPORTED | `layout/SettingsTabs.tsx:119, :125, :149`, `layout/FileMenu.tsx:238`, `sim/GuideResults.tsx:76`, `sim/MotorRow.tsx:92`, `tools/SimpleRocketCards.tsx:14` (`rounded-lg` against `rounded-md`, ring and disabled drift) | `smallButton` |
| D58 | LOW | REPORTED | `design/LineStyleRow.tsx:21-38` | `SelectRow` |
| D59 | LOW | REPORTED | `sim/WindProfileDialog.tsx:56-63` (`bg-warn-500/15 ... ring-warn-500/40`) | `Notice` (with a `note` role) |
| D60 | LOW | REPORTED | `tools/SimpleRocketCards.tsx:128, :141, :200-204` (old D24) | `QNum placeholderSi` |
| D61 | LOW | REPORTED | `sim/WeatherParts.tsx:33-34` (fixed 1 decimal; "0.3 km" where `fmtSpan` gives "300 m") | `fmtSpan` |
| D62 | LOW | REPORTED | `tools/SimpleResults.tsx:51`, `sim/FlightCard.tsx:97` | `withFixedUnit` |
| D63 | LOW | REPORTED | `canvas/CenterCanvas.tsx:190-211` (RollSlider), `canvas/EnvironmentView.tsx:124` (old D114) | `fmtDegrees(u, deg)` |
| D64 | LOW | REPORTED | `canvas/PathExportSections.tsx:139-145, :151-156, :165-170, :209-214` | `Check hint=` |
| D65 | LOW | REPORTED | `canvas/FlightPathExport.tsx:59`, `sim/SiteMap.tsx:182` | `mapButtonClass(active, { floating })` |
| D66 | LOW | REPORTED | `canvas/PathExportSections.tsx:87-97` | `NumberRow` |
| D67 | LOW | REPORTED | `canvas/flightChartTraces.ts:217-224` `STAGE_COLORS` (stage 1 #38bdf8 against #3987e5) | `seriesColor(i)` (`common/chartPalette.ts`); needs a design call |
| D68 | LOW | REPORTED | `canvas/SchematicControls.tsx:74-95` (no `type="button"`, inline accent style) | `ToggleButton` |
| D69 | LOW | REPORTED | `canvas/aeroTables.ts:49-65` `altitudeField` (`Math.round(500 * factor)` against `niceStep`) | `u.plain('distance')` and `onSi` |
| D70 | LOW | REPORTED | `design/ShapeDescription.tsx:9`, `files/rktExport.ts:182-184, :196, :207` | `nodeShape(node)` |
| D71 | LOW | REPORTED | `services/design/discGeometry.ts:256` `endAt`, `design/autoShoulder.ts:124` (raw transition ends; no difference after `syncDerived`) | `transitionRadii(node)` |
| D72 | LOW | REPORTED | `services/design/treeEdit.ts:517-738` `defaultNode` literals (the freeform points copy `KERNEL_FREEFORM_POINTS`; shapes, separation and deployment literals); held by `newParts.kernel.test.ts` | `KERNEL_DEFAULTS` and the `KERNEL_*` constants |
| D73 | LOW | REPORTED | `files/rktExport.ts:572`, `canvas/schematicShapes.tsx:52`, `design/PropertyPanel.tsx:136` (planar fin type sets) | `isPlanarFinSet`, `PLANAR_FIN_TYPES` |
| D74 | LOW | REPORTED | `files/ork/docMaterials.ts:19, :25-26`, `files/orkImport.ts:33`, `files/ork/importTags.ts:388` (bare `Number()`; old D16) | `finiteNum` |
| D75 | LOW | REPORTED | `services/motors/motorSpec.ts:67` (`motor.length / 2000`; old D95) | `fromCatalog(motor.length) / 2` |
| D76 | LOW | REPORTED | `services/flight/driftEllipse.ts:153-158`, `exports/solidMesh.ts:41-46` | `groupBy` |
| D77 | LOW | REPORTED | `common/NumberInput.tsx:57-60` | `useLatestRef` |
| D78 | LOW | REPORTED | `exports/flightPath/colors.ts:32-46` (`rgbToHex`, `hexToRgbInt`, `rgbHex`, `kmlColor`'s `hex2`) | `hexOf`, `parseHexColor`, `rgbChannels` |
| D79 | LOW | REPORTED | `services/report/pdfPage.ts:334-343` (`q`, `qv`) | `fmtSymIn` with `digitsFor` |
| D80 | LOW | REPORTED | `services/flight/ejectionCharge.ts:5-6` (`FT_LBF`, `LBM`; 5e-10 off `units.ts`) | `uiToSi` |
| D81 | LOW | REPORTED | `canvas/schematicParts.tsx:208` (the fairing's `points` string; old D121) | `pointsAttr` |
| D82 | LOW | REPORTED | `layout/BackupDialog.tsx:69` (`assertImportSize` right before `readFileText`, which asserts it) | Drop the line |
| D83 | LOW | REPORTED | `services/app/remoteData.ts:9` (`replace(/\/*$/, '/')`) | `withTrailingSlash`, moved to a dependency-free module |

## HELPER

| Id  | Sev | Tag | Where | Proposed helper |
| --- | --- | --- | ----- | --------------- |
| D84 | LOW | REPORTED | `canvas/aeroTables.ts:254-267`, `tree/schematicGeometry.ts:109` | `bandPath(upper, lower, style)` in `common/svgPath.ts` |
| D85 | LOW | REPORTED | `files/ork/passthrough.ts:202`, `storage/settings.ts:288, :501, :506`, `sim/motorPrefs.ts:4`, `sim/motorColumns.ts:156` | `stringsOf(v): string[]` in `services/app/numbers.ts` |
| D86 | LOW | REPORTED | `state/exportSlice.ts:130-231` (`try { ... } catch (e) { set({ err: actionError(KEY, e, i18n.t) }) }` six times) | A local `guarded(key, run)` |

## COMPONENT

| Id  | Sev | Tag | Sites | Proposed component |
| --- | --- | --- | ----- | ------------------ |
| D87 | MED | VERIFIED | Busy flag, clear error, try, catch into `errorText`, clear busy: `layout/BackupDialog.tsx:36-49`, `design/SavedPartEditor.tsx:32-66`, `design/SavePartButton.tsx:42-56`, `design/MaterialEditor.tsx:55-94` with `MyMaterialsDialog.tsx:83-92`, `design/useCustomMaterialForm.ts:42, :75-77`, `design/ComponentPicker.tsx:303-314` | `useBusyAction()` in `components/common/` (~30 lines) |
| D88 | MED | VERIFIED | Hand-styled `<select>` in about 26 files outside `SelectRow` (`sim/LocationPicker.tsx`, `sim/MotorFilterBar.tsx`, `sim/MotorGuideDialog.tsx` lack the focus ring old D122 added; surfaces and inks vary) | `selectClass(size, surface)` beside `smallButton`, also used by `SelectRow` (~15 lines) |
| D89 | MED | VERIFIED | Tool result row: `tools/FlutterFields.tsx:63-70` (`FlutterRow`), `tools/EjectionFigures.tsx:35, :43, :49`, `tools/SizingFigures.tsx:65, :83`, `tools/SimpleResults.tsx:152-160`, `sim/SimOptionRows.tsx:13` (div against dl markup) | `FigureRow` in `tools/ToolLayout.tsx` (~20 lines) |
| D90 | LOW | REPORTED | `layout/FileMenu.tsx:10-13, :66-77`, `design/ComponentExportButton.tsx:58-68`, `canvas/ImageExportMenu.tsx:62-64` | `MenuItem` beside `MenuPanel` |
| D91 | LOW | REPORTED | "No curve" badge: `sim/MotorGrid.tsx:163-167`, `sim/MotorDialogParts.tsx:123-130`, `sim/MotorGuideDialog.tsx:240-247` | `NoCurveBadge` on `hasLocalCurve` |
| D92 | LOW | REPORTED | Motor filter controls: `sim/MotorDialogParts.tsx:41-76`, `sim/MotorDashboard.tsx:101-125, :177-193`, `sim/GuideResults.tsx:142-158` (borderline; the layout switch may cost what it saves) | `MotorFilterControls` |
| D93 | LOW | REPORTED | Store list on mount: `canvas/useExportTemplates.ts:22-34` (words the error at load, so it misses a language switch), `sim/useLocationList.ts:43-57` | `useStoreList(load)` in `components/common/` |
| D94 | LOW | REPORTED | `canvas/RocketOverview.tsx:70-77` `Row`, `layout/HeaderSummary.tsx:110-125` `Cell` | One label-over-value cell |
| D95 | LOW | REPORTED | Tick and end-value label text: `canvas/ChartPanelFrame.tsx:93-97`, `canvas/FlightXYPanel.tsx:183-188`, `canvas/AeroCharts.tsx:244`, `sim/chartAxes.tsx:55`, `common/chartAxes.tsx:24` (9 px faint) against `LAxes` (10 px muted) | A `TICK_LABEL` class in `common/chartAxes.tsx` |
| D96 | LOW | REPORTED | Crosshair key model: `canvas/FlightChart.tsx` with `useChartCrosshair.ts`, `canvas/AeroCharts.tsx:81-103, :149-163` (see D12) | `useChartCrosshair` with a `samples` option |

## Rejected

- Coincidental similarity: the RASAero, RockSim and `.ork` field tables; `windLevels.vectorAt` against `recoverySizing.profileDensity` against `lerpAt`; `forecastHours` against `landingEstimate`; the per-chart axis-range rules; `buildFlightScene` against `buildModel`; `FlightExhaust` (WebGL) against `ExhaustPreview` (SVG); `keyPan` against `useSiteMapView`; the 2D bounding boxes in `dxfExport` and `templatesSection` against the 3D one in `threeMf`.
- Costs more than it saves: the `JsonListStore` wrappers (`templateStore`, `presetStore`, `launchLocationStore`, `materialStore`, `motorStore`; rejected for the third time); `s.sims.find((x) => x.id === id)` at 22 sites (a name, no lines); the center pane placeholder `div`; the linear scale lambdas; the calipers' mirrored readouts; the aero table rows past the shared shell; `SiteMap` `pickSource` against `useGroundLayer.pick`; the child abort controllers in `forecastHours` and `openMeteo`; the `driftSweepSlice` and `motorGuideSlice` run preamble beyond D21.
- Intended: `importLimits.ts`'s 3 and 6 (a port of the bridge's `ComponentFactory.instancesOf`); the aero chart's sample stepping; `fileSlice`'s `uniqueName` (design-library names); `csvCell`'s `NUMBER` (a leading `+` is a formula trigger); `warningText`'s untrimmed name; `StageColorDialog`'s raw color input (a draft committed on OK); the `SafetyCard` keys spelled out for `keys.test.ts`; the guide CSV writers (old D123).
- Ported kernel math: `web/scripts/lib/presetVolume.mjs` against `catalogPatch` (guarded); `autoRadius`'s own position reader (old D47).

## Recommended order of attack

1. **User-visible drift with a one-line fix:** D7 (`hasUsableCurve`), D4 (per-axis site fallback), D6 (bore through `fieldValue`), D13, D14, D15. Each points a copy at the helper that is already right.
2. **Safety documents and stored data:** D2 (grounded boosters in the launch documents, with a test), D3 (the material overwrite), D10 (`shearModulusOf`).
3. **Units and labels on screen and paper:** D1 (one `SIM_FIGURE` table; take a screenshot pass with chips set), D8 (`fmtCalibers` and one locale key), D20.
4. **Ported geometry, each with a kernel-sourced test:** D5 (aft ring holes), D9 (`finCountOf`), D16, D17, then D11 (`groundPointAt`).
5. **Physics constants:** D18, in one module, pinned by `recoverySizing.test.ts`.
6. **Mechanical consolidations, one module at a time:** the MED `DUP` and `BYPASS` rows (D19, D21 to D26, D50 to D55), then the LOW rows.
7. **Component extractions last:** D87 (`useBusyAction`), D88 (`selectClass`), D89 (`FigureRow`), then the LOW `COMPONENT` rows, each with a screenshot pass.
