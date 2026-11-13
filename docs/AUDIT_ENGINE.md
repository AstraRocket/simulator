# AUDIT_ENGINE - `engine-java/` audit (AstraRocket)

<!-- cspell:ignore misroute scalings reassociated Descr serieslens -->

Date: 2026-11-09. Branch `dev` at 906513c. Run per `docs/AUDIT_PROMPT_ENGINE.md`: five parallel review agents, one per slice (patches, the `src/api` facade, shims and the JDK stub, build and extraction, the gates), then an independent verification pass over every HIGH and MED claim, merged here.

Paths and line numbers are as of 906513c. If one does not match, search for the quoted expression.

## How to read this

- **Pinned upstream was obtained.** `engine-java/extract/UPSTREAM` pins `2d76b9733a1c1ccd5e59eddc7f778a15a803cc34`, and `engine-java/.openrocket-src` was checked out at exactly that commit. Every patch was diffed against the file at the same path there, and every patch finding cites the upstream line.
- **VERIFIED** means the cited lines were read and the claim confirmed by a second reader, independently of the agent that raised it, or the agent demonstrated it with a probe (named in the finding). **REPORTED** means the claim is plausible and cited, but was not confirmed that way.
- Severity markers: 🔴 correctness in shipped physics, 🟠 gates and build integrity, 🟡 API boundary and untrusted input, 🟢 documentation drift and dead weight. **⬆ UPSTREAM** marks a defect in verbatim OpenRocket code: the fix belongs in a patch or upstream, never as an in-place edit to `src/java`.
- `RASAeroDragCalculator` and `RASAeroStabilityCalculator` are out of scope, as the prompt states.

## Status

| Category                               | HIGH  | MED   | LOW    | UPSTREAM | Total  |
| -------------------------------------- | ----- | ----- | ------ | -------- | ------ |
| 🔴 Correctness in shipped physics      | 0     | 1     | 3      | 1        | 5      |
| 🟠 Gates and build integrity           | 0     | 6     | 12     | 0        | 18     |
| 🟡 API boundary and untrusted input    | 0     | 2     | 13     | 0        | 15     |
| 🟢 Documentation drift and dead weight | 0     | 0     | 6      | 0        | 6      |
| **Total**                              | **0** | **9** | **34** | **1**    | **44** |

No HIGH finding. No unexplained hunk changes physics on the default (flags-off) path.

## Gates run

| Gate                              | Result                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run audit` in `engine-java/` | Pass: all 5 checks (`parity` with `--expect-lines 367`, `committed`, `extract --check`, `date`, and the validation floors: classic and supersonic, supersonic 61/135, gated-set sha256 1189f0ff...). The working tree was unchanged afterward, so the vendored engine matched a fresh build at 906513c. See E5 for what `committed` does not check. |
| Pinned upstream diff              | 19 patch files diffed hunk by hunk against `2d76b97`.                                                                                                                                                                                                                                                                                               |
| Probes                            | Slice agents ran the vendored `.mjs` and `.wasm` in Node for E2, E14, E15 and E17, and scratch copies of `extract/` for E7 to E10. Nothing in the repo was edited.                                                                                                                                                                                  |

## Patch hunk classification

All 19 patch files are load-bearing (each `src/java` file differs from upstream) and byte-equal to its `patches/` copy. All 19 are in `manifest.txt` and in `DIVERGENCE.txt`. There are no leftover patches. There are exactly 36 `PATCH(` markers and a further 47 `PATCH (` markers (42 RASAero, 5 stubby-nose floor).

| File                         | Hunks | TeaVM compat | RASAero / opt-in | Documented deliberate               | Unexplained       |
| ---------------------------- | ----- | ------------ | ---------------- | ----------------------------------- | ----------------- |
| FinSetCalc                   | 12    | 0            | 8                | 1 (attribution header)              | 3 (cosmetic, E40) |
| SymmetricComponentCalc       | 11    | 0            | 8                | 1 header, 2 stubby-nose floor (E41) | 0                 |
| BarrowmanDragCalculator      | 7     | 2            | 4                | 1 header                            | 0                 |
| BarrowmanStabilityCalculator | 5     | 3            | 1                | 1 header                            | 0                 |
| MassCalculation              | 2     | 0            | 0                | 1 (offaxis-roll-inertia)            | 1 (comment, E40)  |
| RingComponent                | 1     | 0            | 0                | 1 (offaxis-roll-inertia)            | 0                 |
| FinSet                       | 3     | 2            | 1                | 0                                   | 0                 |
| FreeformFinSet               | 4     | 3            | 0                | 1                                   | 0                 |
| FlightConfiguration          | 2     | 2            | 0                | 0                                   | 0                 |
| InstanceMap                  | 2     | 2            | 0                | 0                                   | 0                 |
| FlightConfigurationId        | 4     | 4            | 0                | 0                                   | 0                 |
| MotorConfigurationId         | 3     | 3            | 0                | 0                                   | 0                 |
| BasicEventSimulationEngine   | 2     | 1            | 0                | 1 (drogue-low-speed)                | 0                 |
| SimulationOptions            | 9     | 9            | 0                | 0                                   | 0                 |
| BoundingBox                  | 4     | 4            | 0                | 0                                   | 0                 |
| Unit                         | 2     | 2            | 0                | 0                                   | 0                 |
| ArrayList                    | 1     | 1            | 0                | 0                                   | 0                 |
| ComponentAssembly            | 1     | 1            | 0                | 0                                   | 0                 |
| Mutable                      | 2     | 2            | 0                | 0                                   | 0                 |

The interrogation of the compatibility hunks found them sound:

- **`instanceof` chain** (`BarrowmanDragCalculator`, `BarrowmanStabilityCalculator`): exhaustive over the concrete aero and assembly classes in the extracted set (Trapezoid, Elliptical and Freeform fin sets to FinSetCalc; TubeFinSet; LaunchLug; RailButton; NoseCone, Transition and BodyTube to SymmetricComponentCalc; Rocket, AxialStage, ParallelStage and PodSet to ComponentAssemblyCalc). The branches are disjoint, so order cannot misroute; this matches `Reflection.construct`'s hierarchy walk (upstream `Reflection.java:147-192`).
- **`Geo2D`**: `relativeCCW` and `segmentsIntersect` are token for token the JDK `Line2D` algorithm, including endpoint-touching and collinear cases; `distance` is bit-equal to `Point2D.distance`.
- **`"%g"` to `"%s"`** in `BasicEventSimulationEngine` (ours 607-610, upstream 607-608): the string reaches `log.info` only.
- **`PATCH(drogue-low-speed)`** (upstream 673-680): only the comment markers were removed.
- **`ConcurrentLinkedQueue` to `LinkedList`**: nothing in `src/java`, `src/shims` or `src/api` starts a thread, an executor or a parallel stream.
- **`InstanceMap` order**: upstream's `ConcurrentHashMap` iterates in an order set by random UUIDs, so there is no fixed upstream order to match; the patch makes it stable.
- **Flags-off bit identity**: FinSetCalc, SymmetricComponentCalc and BarrowmanDragCalculator reduce to upstream's expressions with the RASAero flags off (the `1.0*` scalings and the reassociated boattail `/2` are exact).

---

## 🔴 Correctness in shipped physics

### E1 | MED | The "rail needed" figure is too short when the rod is shorter than the guide-to-aft distance | VERIFIED

`engine-java/src/api/java/api/RailSpeedProbe.java:49-51` with `GuideClearanceListener.java:58-111`; shown by `web/src/components/sim/SimSummary.tsx:94-112`. The offset is `realRodLength - effectiveRodLength(rod)`, and `travel()` clamps at 0 (`Math.max(0, rodLength - (maxX - guideX))`), so the offset is `min(rod, maxX - guideX)` instead of `maxX - guideX`. Probe (`scratchpad\eng2\rail.mjs`) on a 1.0 m rocket with a lug 0.05 m from the top: rod 0.3 m reports 0.996 m, rod 0.6 m reports 1.296 m, rod 1.0 m or longer reports 1.586 m (the true value). With a single rail-button station `effectiveRodLength` is 0, so the figure becomes travel plus the current rod, which means nothing.
**Why it matters:** a safety figure is understated by up to `(maxX - guideX) - rod`. The rail-exit warning itself stays correct (the figure still exceeds the rod), so only the number is wrong. The feature is opt-in (`guideAwareRodClearance`, default false, `web/src/services/storage/settings.ts:242`).
**Fix:** compute the offset as `maxX - guideX` from a helper that does not take the rod length; return NaN when there is no lug and no two-station button line.

### E2 | LOW | Constant gravity defaults to 9.80665 where desktop uses 9.807 | VERIFIED

`OpenRocketEngine.java:1365`; web side `web/src/components/sim/EarthModelSection.tsx:49-50` and `web/src/services/files/ork/exportSimulation.ts:104`. Desktop's default is 9.807 (upstream `ApplicationPreferences.java:784`), and the shim matches it (`ApplicationPreferences.java:92-94`), but the facade builds its own conditions and never reads the shim.
**Why it matters:** a 3.5e-5 relative difference from desktop with the constant gravity model and no explicit value; nothing in the UI shows it and the golden prints the shim's value, not the facade's.
**Fix:** use 9.807 on both sides, or record 9.80665 as a deliberate choice.

### E3 | LOW | Opt-in supersonic OGIVE wave drag steps at the end of upstream's table | VERIFIED (code reading)

`SymmetricComponentCalc.java:361-371` (ours) / upstream `322-326` (`9b974b5cf`). Upstream now builds the OGIVE table from the equivalent-cone angle `1/sqrt(1+4f^2)`, which runs to about M3.98. Above that, with `supersonicAero` on, the patch's `analyticNose` continuation still uses `sinphi`, the joint angle (0 for a tangent ogive). Affects non-nose OGIVE transitions and nose ogives with `param < 0.35`.
**Why it matters:** opt-in only and above M4, but the wave drag jumps at the table end. The LEDGER entry for the bump says the opt-in branches are "otherwise unchanged".
**Fix:** use the same equivalent-cone value in the OGIVE `analyticNose` branch, or record the step as accepted.

### E4 | LOW | `FinSet.getPointDescr` still formats with `%g` | REPORTED

`FinSet.java:1716` (ours) / upstream `1641`. `String.format("... (%6.4g, %6.4g)")` remains in a file already patched for TeaVM. It is reachable through `FinSet.toDebugDetail()`, for example from `RocketComponent.java:1529`, which builds a `BugException` message when an axial offset is NaN. No other `%g` remains in `src/java`.
**Why it matters:** only on an error path, but under TeaVM the formatter would throw first and replace the intended exception (on WASM-GC, an uncaught trap). The TeaVM formatter behavior is taken from the LEDGER, not run.
**Fix:** concatenate, as `FreeformFinSet` already does.

### E5 | UPSTREAM ⬆ | Nozzle exit area is summed in a random order | VERIFIED (code reading)

`FlightConditions.java:164, :212-216` and `AbstractSimulationStepper.java:148` (unpatched). `getThrustingNozzleExitArea()` sums a `HashMap<ComponentAssembly, Double>` whose key hash comes from a random UUID (`RocketComponent.java:1331, :2874`), and `AbstractRKSimulationStepper.java:222` feeds the sum into the thrust pressure correction.
**Why it matters:** with three or more assemblies thrusting at once and nozzle exit diameters set, thrust can differ by an ulp from run to run and between JVM and TeaVM. The same defect class the `InstanceMap` and `FlightConfiguration` patches fix.
**Fix:** a patch using `LinkedHashMap` at both sites.

## 🟠 Gates and build integrity

### E6 | MED | The `committed` step compares a rebuild with a rebuild, never with what is committed | VERIFIED

`engine-java/audit.mjs:24-31, :58-59`; `test/parity/parity.mjs:39-44`; `build-engine.mjs:92`. The `parity` step runs first, and `build-engine.mjs` copies fresh artifacts over `web/src/engine/vendor/openrocket-engine.mjs` and `web/public/engine/*`. Only then does `rebuildMatches` take its `before` hashes and build again (Gradle finds the TeaVM tasks up to date). Demonstration: edit `src/api/java/api/OpenRocketEngine.java` or a patch, do not rebuild, run `npm run audit`: every step passes, and the only trace is a modified binary in the working tree.
**Why it matters:** `engine-java/README.md:164`, `build.gradle:65-69, :101-105`, `docs/DEVELOPER.md:284` and `docs/AUDIT_PROMPT_CHANGES.md:25` all rely on this step to catch an unbuilt bridge edit, and it cannot. Nothing in CI ties the deployed binary to source either (E11). This run is unaffected: the tree was clean after the audit.
**Fix:** compare each vendored file's hash with `git show HEAD:<path>` (or hash before `parity`), and run the second build with `--rerun-tasks --no-build-cache` if determinism is the intent.

### E7 | MED | A bless can hide a physics change the LEDGER does not explain | VERIFIED (demonstrated)

`extract/extract.mjs:258-292`. `--bless` rewrites `DIVERGENCE.txt` and only prints a suggested LEDGER stanza. Demonstration in a scratch copy: change `cna *= 0.948` to `0.990` (`FinSetCalc.java:239`) in `patches/` and `src/java`; `--check` fails ("1 unblessed"); `--bless` writes the new delta and sha; `--check` passes; `LEDGER.md` is byte-identical.
**Why it matters:** the only defense against an unexplained coefficient change is a reviewer noticing a sha in a `DIVERGENCE.txt` diff.
**Fix:** record each patch's sha prefix in its LEDGER entry and have `--check` require every `DIVERGENCE.txt` patch sha to appear in `LEDGER.md`.

### E8 | MED | One bless also accepts upstream movement under every shim | VERIFIED (demonstrated)

`extract/extract.mjs:329-349`. The same `--bless` re-baselines `SHIMS.txt`. Demonstration: append a line to upstream `startup/Application.java` (a shadowed class) and edit a patch; one `--bless` rewrites both baselines and `--check` then passes.
**Why it matters:** blessing an unrelated patch also accepts the exact upstream change `SHIMS.txt` exists to force a review of.
**Fix:** a separate `--bless-shims`, or refuse a bless while shims are flagged.

### E9 | MED | The upstream tree is trusted without checking it is clean, and an override bypasses the pin | VERIFIED (demonstrated)

`extract/extract.mjs:74, :97-102`; `audit.mjs:60`. The cache is reused when `rev-parse HEAD === ref`, with no clean-tree check; `--src` and `OPENROCKET_SRC` bypass the pin entirely, and `audit.mjs` passes no `--src`, so a stray environment variable wins. Demonstration: change `ExtendedISAModel.java:42` from 288.15 to 298.15 in `src/java` only and `--check` fails; make the same edit in the upstream tree too and `--check` passes.
**Why it matters:** `.openrocket-src` is shared with `reference/provision.mjs` and `web/scripts/lib/openrocketJava.mjs`, which raises the chance of a local edit there; a verbatim physics file edited in both places passes the reproducibility gate.
**Fix:** require `git -C <cache> status --porcelain -- core/src/main/java` to be empty and, for `--src`, `HEAD == ref`; have `audit.mjs` refuse an override.

### E10 | MED | The validation gate hash leaves out the fields that set the scored values | VERIFIED

`validation/score.mjs:138-145, :186-187, :205`. The gated-set hash covers name, series id, quantity, base, Mach, anchor and tolerance. It leaves out `refAreaScale` (which multiplies `cd` and `cna` directly), `aoaDeg`, `machAlt`, `maxMach` and `fixture`. The `_expect.aero` pin runs at zero angle of attack, without `machAlt` or `refAreaScale`, and lives in the fixture it pins.
**Why it matters:** changing hb2's `refAreaScale` from 2.56 to 2.7, basic-finner's `aoaDeg`, or arcas-long's `fixture` keeps 135 gates and the same hash, so a model regression can be offset while the ratchet stays green. `validation/README.md:90-93` says a widened tolerance fails; these move results the same way.
**Fix:** put every per-anchor scoring field and a hash of each fixture's `components` into the gated-set hash.

### E11 | MED | No CI job checks the engine, and the master deploy ships the vendored binary | VERIFIED

`.github/workflows/gates.yml:10-12` (jobs: build-and-test, housekeeping, unit, repo, e2e, website). No workflow runs `extract --check`, `parity`, the rebuild check or `score.mjs`. `deploy.yml` ships the committed vendored engine on every push to master, and `sync-catalogs.yml:39` republishes the data branch on a vendored-engine change. The trade-off is stated in `gates.yml` and `engine-java/README.md:157`.
**Assessment:** the reason (JDK and time cost) holds for parity and the rebuild, but `extract --check` and `score.mjs --check-floors` need only Node and take seconds. With E6, nothing anywhere verifies the shipped binary today; an unblessed patch edit merges green.
**Fix:** a path-filtered job (`engine-java/**`, `web/src/engine/vendor/**`) running `extract --check` and both `score.mjs --check-floors`.

### E12 | MED | The golden check uses the cross-target flight tolerance for a same-JVM comparison | REPORTED

`test/parity/parity.mjs:104-110, :119-124`. Non-flight lines are compared exactly. `flight.*` lines fail only when the absolute difference exceeds 6e-5 and the relative one exceeds 3e-3; `flight.conditions.*` gets 6e-3, and `flight.conditions.serieslens` an unscaled slack of 5 samples. These bands come from JS and WASM noise, but the golden compares the JVM with itself.
**Why it matters:** flight-only physics (WGS gravity, `ParityMain.java:1011`, the stepper, recovery descent, wind) reaches the golden only through these lines. A patch that moves apogee (330.676 m) by under 0.99 m, or event times by under 0.3%, passes the golden, and parity is green because all three targets agree.
**Fix:** a much tighter band for the golden (around 1e-9 relative), or a golden per platform.

### E13 | LOW | Shadow detection is by path and covers `src/shims` only | VERIFIED (latent)

`extract/extract.mjs:24, :294-298`; `build.gradle:37-43, :63`. The main source set also compiles `src/api/java` and `test/`, and javac does not tie a package to its directory. Demonstration in a scratch copy: delete the `ExtendedISAModel.java` manifest line and file and add `test/elsewhere/ExtendedISAModel.java` in package `info.openrocket.core.models.atmosphere`: `extract --check: OK` (compile not run). Nothing under `src/api` or `test/` uses an `info.openrocket` name today.
**Fix:** scan every main source directory and detect shadowing by declared package and class name.

### E14 | LOW | `golden-guard.mjs` is run by nothing and keys lines wrongly | VERIFIED

`test/parity/golden-guard.mjs:27-31`. No script, workflow or `audit.mjs` calls it, and it keys lines by `split('|')[0]` although `golden.txt` has 367 values under 173 keys (`roll.lateral` appears 36 times); replayed on an identical golden it reports 194 "moved" values. A `parity:golden` rewrite therefore shows only as a raw diff whose header always changes.
**Fix:** key by tag plus ordinal, wire it into the pull request checks for changes to `golden.txt`, and write the moved list where a reviewer sees it.

### E15 | LOW | `--golden` skips the line-count check | VERIFIED

`test/parity/parity.mjs:216-237, :265`. `parity.mjs --golden --expect-lines 367` writes a 366-line golden and exits 0; the header `lines=` field is never checked, and a scenario swapped for another of equal length keeps 367.
**Fix:** enforce `--expect-lines` in golden mode and pin a hash of the tag column.

### E16 | LOW | The validation floor is a pass count, not a set | REPORTED

`validation/score.mjs:234`. A change that fails one gated point and newly passes another holds 61 and passes.
**Fix:** record the passing set and require a superset.

### E17 | LOW | The pruned-export guard is vacuous for `free` and `reset` | VERIFIED

`build-engine.mjs:142-152`. `\bfree\b` matches the radius-method string literal "free" (3 hits in the `.mjs`, 10 in the `.wasm`); `reset` has 8 and 11 hits. The list also omits `newRocket`, the `addX` exports, `getComponentGeometry` and `getComponentFields`.
**Fix:** match the `export {` clause for JS and `WebAssembly.Module.exports` for WASM, with the list derived from the `@JSExport` methods.

### E18 | LOW | Shim contents are never hashed | VERIFIED (code)

`extract/extract.mjs:294-327`; `src/shims/java/info/openrocket/core/database/Databases.java:33-45`. `SHIMS.txt` tracks upstream moving under a shim, not the shim itself. The hand-copied default densities match upstream today, but one could change with `--check` green; the material-row check compares only `materials.generated.json` with upstream.
**Fix:** add a shim content sha to `SHIMS.txt`, or check the shim's densities against the parsed upstream table.

### E19 | LOW | Seven parsers of `UPSTREAM` disagree on a duplicated key | VERIFIED

`web/vite.config.ts:51-58` and `website/docusaurus.config.ts:28-36` take the last `ref =`; `extract/extract.mjs:43`, `audit.mjs:35` and `web/scripts/sync-examples.mjs:16` take the first; `reference/provision.mjs:24` rejects trailing text; `web/tests/services/app/appInfo.test.ts:29` uses `.find`. Demonstration: `scratchpad\eng4\pin-parsers.mjs`.
**Why it matters:** a half-done bump shows one SHA in the About dialog and the docs while the gate checks another.
**Fix:** one shared parser that rejects duplicate keys.

### E20 | LOW | The JDK update and the Gradle distribution are not pinned | REPORTED

`build.gradle:92-107`; `gradle/wrapper/gradle-wrapper.properties`. The toolchain pins vendor and major (Adoptium 21), not the update, and the wrapper has no `distributionSha256Sum`. No paths or timestamps were found in the vendored output.
**Fix:** pin or record the JDK update and add `distributionSha256Sum`.

### E21 | LOW | The JVM reference and the build run with no timeout | REPORTED

`test/parity/parity.mjs:32-47`. Only the TeaVM targets get the 2-minute kill. A JVM simulation that never ends hangs `npm run audit`; it fails closed.
**Fix:** a timeout on both calls.

### E22 | LOW | Validation scores the JS engine only | VERIFIED

`validation/score.mjs:12-14`. The app loads WASM-GC by default; WASM and JS agreement is shown only for the `ParityMain` scenarios, not for the fixture sweeps with `machAlt` or `aoaDeg`.
**Fix:** score the WASM target too, or add the four fixtures to `ParityMain`.

### E23 | LOW | `anchors.json` has no schema check, and `--record-expect` rewrites pins silently | VERIFIED (code)

`validation/score.mjs:91-197, :112-122`. A series with neither `tol` nor `relTol` crashes with a TypeError at `tol.toFixed` (fails closed); points beyond `maxMach` are clamped silently.
**Fix:** validate known keys, numeric points, exactly one tolerance, and points within `maxMach`.

### E24 | LOW | `--bless` exits 1 after a successful write | VERIFIED (demonstrated)

`extract/extract.mjs:464-469`. Problems are computed before the write, so a successful bless prints "a patch changed without review" and fails any `&&` chain.
**Fix:** recompute after the write.

### E25 | LOW | The two largest patches carry no `PATCH(` marker | VERIFIED

`FinSetCalc.java:71-121` and `SymmetricComponentCalc.java` use `PATCH (RASAero` with a space, which the "unpatched" regex (`extract.mjs:172`) and the 36-marker count skip. No gate impact: drift still catches a revert.
**Fix:** normalize the markers or widen the regex to `PATCH\s*\(`.

### E26 | LOW | Nothing pins `Geo2D` to `java.awt.geom` | VERIFIED

`src/shims/java/info/openrocket/core/util/Geo2D.java:10-45`. It matches the JDK today, but parity runs `Geo2D` on all three targets and `SHIMS.txt` tracks only shadowing shims; an earlier `hypot` defect in this file was found only by an audit (LEDGER 2026-09-19).
**Fix:** a JVM-only check against `Line2D.linesIntersect` and `Point2D.distance` on random and degenerate inputs.

### E27 | LOW | The `Collator` stub matches the JDK only on the parity corpus | VERIFIED

`src/jdkstubs/java/text/Collator.java:67-120`. A probe against JDK 21.0.12 on 22 names with punctuation and an accented letter found 378 of 1936 comparison signs disagree ("H128~W" against "H128W"; "H128(W)" against "H128#W"): `primaryWeight` remaps only `_ / . '` and orders other punctuation by code point. The default-locale path is not exercised by parity. No shipped output depends on it: the facade sorts with `String` order (`OpenRocketEngine.java:853`) and the app sorts motors itself.
**Fix:** widen the corpus and port the JDK punctuation order, or reword the stub header and the LEDGER's "0 of 1369" to say it matches on the parity corpus only.

## 🟡 API boundary and untrusted input

### E28 | MED | Nested assemblies multiply instances with no cap, so a small file freezes the tab | VERIFIED (measured)

`ComponentFactory.java:60, :588, :817`; `web/src/services/files/ork/importLimits.ts:16-25`. Each assembly is capped at 64 instances, and `importLimits` mirrors that per assembly, but nothing caps the product. Three nested pod sets of 64 make 262,144 instances: on JS, `buildRocket` took 9.6 s and `getStaticInfo` 3.9 s. The file is under 1 KB, depth 7, inside every import cap. `buildTree` calls `buildRocket` synchronously on the main thread (`web/src/engine/openRocketEngine.ts:646-648`).
**Why it matters:** a crafted `.ork` freezes the tab, which `importLimits.ts:8` says the limits prevent; four levels is 64 times worse, and on WASM-GC an out-of-memory trap cannot be caught.
**Fix:** track the cumulative instance multiplier (assemblies, line instances, clusters, fin counts) and refuse above a total such as 4096 in the bridge, mirrored in `importLimits.ts`.

**Resolution:** Fixed. `ComponentFactory.checkSize` runs before any kernel work in `buildRocket`. It multiplies each part's copies out (pod and parallel stage counts, line instances, clusters and fin counts) and refuses a summed total over `MAX_TOTAL_INSTANCES` (20,000). The cap is on the sum, not the product along one path, because 64 × 64 pods holding a thousand parts stay under any per-path cap. `importLimits.checkBuildSize` holds the same count and refuses the file in `parseDesignFile`, with a keyed message in all 10 languages. Pinned by `engineBoundary.test.ts` ("refuses nested counts that multiply out past the browser ceiling, before building") and `designFile.test.ts`.

### E29 | MED | Automatic radii are settled with a fixed number of full passes | VERIFIED (measured)

`OpenRocketEngine.java:697-713`, called at `:255`. `settleAutoRadii` always runs `symmetric + 1` passes over the whole rocket with no early exit. Measured builds: 2,000 body tubes 0.49 s, 5,000 3.0 s, 10,000 11.3 s on JS and 15.9 s on WASM-GC; 10,000 mass components in one tube 2.3 s.
**Why it matters:** every rebuild pays it, per edit on the main thread and twice on a failed import (`buildForImport` retries); a file inside the 10,000-component cap stalls for 10 s or more each time.
**Fix:** stop when a pass changes no fore or aft radius (the app's resolver already does), and cap the component count in `buildRocket` at `importLimits`' `MAX_COMPONENTS`.

**Resolution:** Fixed. `settleAutoRadii` stops at the first pass that moves no radius: 200 chained automatic radii took 24 s and now take 0.3 s. `ComponentFactory.checkSize`, mirrored by `importLimits.checkBuildSize`, refuses more than `MAX_COMPONENTS` (now 1,000; the largest real design has 53) and more than `MAX_AUTO_RADIUS_RUN` (16) automatic radii in a row, since each walks back to a sized part. The slowest design inside both limits builds in about 0.8 s. Parity golden unchanged (367 values bit-identical). Pinned by `engineBoundary.test.ts` and `designFile.test.ts`.

### E30 | LOW | Freeform fin points skip the magnitude cap | VERIFIED

`ComponentFactory.java:260-272` against `dbl()` at `:98-108`; `OpenRocketEngine.java:588-589`. Points are cast straight from JSON. `JsonLite` already rejects NaN and Infinity, and the kernel snaps coordinates above 2.5 m, so only large negative values get through: `[[0,0],[-1e300,...],...]` builds, and `getStaticInfo` returns CG and stability as null with no error.
**Fix:** apply `MAX_MAGNITUDE` to each coordinate and run `requireFinite` on `cg`, `cp` and the stability figures.

### E31 | LOW | The kernel's 8M-character cap counts passthrough the kernel ignores | REPORTED

`JsonLite.java:14`; `web/src/engine/openRocketEngine.ts:647`. `buildTree` sends the whole tree, including `xmlExtra`, `docExtra` and `documentMaterials`. A `.ork` with one 9 MB unknown element parses in JS, then `buildRocket` throws "input of N chars exceeds", the retry throws too, and the file does not open.
**Fix:** strip passthrough keys before sending, or add a serialized-size check with a keyed message.

How the caps split today: nesting depth, kernel 64 on every path and JS 29 on `.ork`/`.rkt` only; input size, kernel 8M characters and JS archive bytes only; component count, JS only (10,000, `.ork`/`.rkt` only); fin count 8, instances per assembly 64, line count 1024 and fin points 10,000 on both sides; scalar magnitude 1e6 and non-negative, kernel only; instance product and fin point magnitude, neither.

### E32 | LOW | Duplicate ids are accepted and the later part wins | VERIFIED

`ComponentFactory.java:749-752`; `OpenRocketEngine.java:225-228`. `setMotorById`, `getComponentInfo`, `settleFinTabs` (`:800-811`) and `settleFlippedShoulders` (`:785-797`) then address only the last part.
**Fix:** refuse a duplicate id.

### E33 | LOW | Three wrong-typed fields fall back silently | VERIFIED (position, clipped)

`JsonLite.java:298-301`; `ComponentFactory.java:158-161, :253-254`. `obj()` returns null for a non-object, so `"position":"top"` places the part at the constructor default; a non-boolean `clipped` is ignored; a non-list `points` builds the default outline. This breaks the stated "refused, not defaulted" policy (`JsonLite.java:254`).
**Fix:** throw `wrongType` when the key is present with the wrong type.

### E34 | LOW | `JsonLite` accepts input strict JSON rejects | VERIFIED (control character, surrogate)

`JsonLite.java:142-157, :165, :226`. Raw control characters inside strings, a raw lone surrogate (an escaped one is rejected), `Character.isWhitespace` (U+000B, U+001C to U+001F, Unicode spaces) and non-ASCII hex digits in `\u` escapes.
**Fix:** reject characters below 0x20, check surrogates on raw characters, and accept JSON whitespace and ASCII hex only.

### E35 | LOW | Second-line guards let Infinity and NaN through | VERIFIED

`OpenRocketEngine.java:441, :461, :472` (`applyMotor` accepts an Infinity diameter or length and a NaN ejection delay); `:678-695` (`setShoulderLength` passes NaN or a negative length to the kernel).
**Fix:** `positiveArg` for sizes, finite or +Infinity for the delay, `nonNegativeArg` for the shoulder.

### E36 | LOW | A null string argument fails differently per target, and a wrapper comment says otherwise | VERIFIED

`web/src/engine/openRocketEngine.ts:48`; `OpenRocketEngine.java:897-902`. Both targets throw a `JavaError` with the Java message (the README is right; the comment is not). A null `String` argument reports a JS `TypeError` on one target and `NullPointerException` on the other; `setLengthUnit` catches only `IllegalArgumentException`.
**Fix:** correct the comment and add null checks with named messages.

### E37 | LOW | `getComponentMasses` turns a non-finite mass into 0 | REPORTED

`OpenRocketEngine.java:868-870, :876-878`, while `getStaticInfo` and the sweep emit null. A broken part shows a plausible 0 kg row.
**Fix:** emit null.

### E38 | LOW | Smaller boundary inconsistencies | REPORTED

- `ComponentFactory.java:785-811`: `settleFlippedShoulders` and `settleFinTabs` look parts up by id, so a node without an id is never re-settled.
- `ComponentFactory.java:96` against `OpenRocketEngine.java:498-502`: a tree's ignition delay must be non-negative; `setMotorIgnitionById` accepts a negative one.
- `ComponentFields.java:293, :305` against `OpenRocketEngine.java:1754-1758`: two escapers; a name with `\b` or `\f` reads back altered from `getComponentFields`.
- `OpenRocketEngine.java:1022-1100`: `machAlt` rows are not checked to ascend in Mach.

### E39 | LOW | `LongUUID.fromString` does not reproduce the JDK | VERIFIED

`src/shims/java/info/openrocket/core/util/LongUUID.java:35-49` against JDK 21 `UUID.fromString1`. No per-field masks, no length cap, and `split("-")` drops trailing empty fields: "0-10000-0-0-0" parses differently, and a 37-character string is accepted where the JDK rejects it (upstream then falls back to `new UUID(0, hashCode)`). Dead code today: nothing calls `FlightConfigurationId(String)`, and ids never cross the facade. `equals`, `hashCode`, `compareTo` and `toString` match the JDK. The patch comment at `FlightConfigurationId.java:3-8` claims an exact match.
**Fix:** port the masks and checks, or remove the string path and correct the comment.

## 🟢 Documentation drift and dead weight

### E40 | LOW | Unexplained comment and placement hunks in two physics patches | VERIFIED

- `MassCalculation.java:397-400` (ours) / upstream `386-390`: upstream's comment is reworded, with no marker and no LEDGER mention. It accounts for `DIVERGENCE.txt` reading 32 while the LEDGER says "19 to 23".
- `FinSetCalc.java:261-268, :673-686` (ours) / upstream `158-188, 213, 553-582, 599-620`: older upstream comment wording, `calculateNacaApplicabilityWeight` moved with its reverse-flow paragraph dropped, a deleted blank line, whitespace in `calculateFinCNa1`. None of it is RASAero.

No behavior change, but the "every hunk is explained" claim is false here. **Fix:** restore upstream's text and placement, keep only the RASAero hunks, and re-bless.

### E41 | LOW | The stubby-nose floor has no LEDGER section | VERIFIED

`SymmetricComponentCalc.java:84, :91, :635, :664, :707` (five `PATCH (stubby-nose floor)` markers). `LEDGER.md:64`, the file's row, says only "RASAero #1 Phase 1"; `:111`, `:879` and `:883` mention the flag in passing. Nothing explains the default-path restructure of upstream's three early returns (upstream `411-421`) into one guard at ours `:671`, whose comment ("the exact negation") is not literally true under NaN: upstream falls through to the `a*M^b` fit, ours skips it (not reachable for real geometry).
**Fix:** a LEDGER section for the floor and the guard rewrite, the row updated, and the comment reworded.

### E42 | LOW | The engine audit prompt describes CI jobs and a build variant that do not exist | VERIFIED

`docs/AUDIT_PROMPT_ENGINE.md`: `:243-247` (a `validate` job in `gates.yml`), `:218-219` (a parity job with a rebuild-and-diff step), `:222` (`-Pparity` variant), `:224` and `:63` (`gates.yml` reads the ref), `:49` ("green parity job"), `:68` and the slice 1 heading (18 patch files; there are 19), `:236` (362 golden lines; there are 367), and `:20, :121-123` (5 files in `src/api` with old line counts; there are 7: OpenRocketEngine 1766, ComponentFactory 904, ComponentFields 317, JsonLite 302, GuideClearanceListener 170, RailSpeedProbe 92, AtmosphereProfile 91). `docs/AUDIT_PROMPT.md` ("CI runs no engine checks") is the accurate one.

### E43 | LOW | The README, LEDGER, developer guide and build comments describe CI checks and a variant that are gone | VERIFIED

- `engine-java/README.md:22, :39`: 18 overrides and 255 verbatim files (19 and 254); `:164`: `npm run audit` "fails if the committed artifacts differ" (E6).
- `engine-java/patches/LEDGER.md:32, :101-103, :204, :610, :923, :1039`: CI jobs (`reproducible`, a parity `git diff --exit-code`, `validate`) with no entry recording their removal; `:844-849`: build-engine asserts "contains no ParityMain", a check that no longer exists.
- `docs/DEVELOPER.md:339, :353`: parity builds a `-Pparity` variant and the shipped engine carries no test code; `build.gradle:57, :63` compile `ParityMain` into every build. `:284`: the committed check (E6).
- `engine-java/build.gradle:62` (harness cost "about 2%", the README says 3%), `:142-143` (parityJvm compares "bit-identical"; flight lines use a tolerance), `:65-69, :101-105` (E6); `gradle-wrapper.properties:6` ("the parity job").
- `validation/floors.json:3` and `validation/README.md:23, :58, :70, :90-93`: "CI ratchet"; only `npm run audit` runs it.
- `.github/workflows/sync-catalogs.yml:18-19`: materials held "by the extraction gate", which runs only by hand.

### E44 | LOW | `UPSTREAM`'s header omits four of its readers | VERIFIED

`engine-java/extract/UPSTREAM:10-16` does not list `reference/provision.mjs`, `web/scripts/lib/openrocketJava.mjs`, `web/tests/services/app/appInfo.test.ts` or `web/tests/services/storage/exampleLibrary.test.ts`.

The facade's `addNoseCone`, `addBodyTube`, `addTrapezoidFins`, `addInnerTube` and `addParachute` exports (`OpenRocketEngine.java:94-98, :335-416`) are unused by the app and register handles that outlive `free(rocket)`; they are dead weight in both modules (REPORTED, counted under E38's family rather than separately).

---

## Checked and sound

- **Handle lifecycle.** Every build path calls `reset()` first (`web/src/engine/api.ts:30`, `simWorker.ts:47`, `loadOrk.ts:158`), so one design is live at a time; the generation guard throws `StaleDesignError`; the counter refuses at `MAX_VALUE`; a stale handle gives "Unknown handle".
- **`JsonLite`.** Depth 64 holds on both targets; non-finite and leading-zero literals and duplicate keys are refused.
- **Automatic radii in `ComponentFactory`.** A flipped nose cone's `aftRadiusAuto` follows the part ahead (fore 0.02 m from the tube ahead), and a transition with no radii resolves automatically (0.03/0.02), matching `NoseCone.java:90-97`, `Transition.java:162, :273` and `web/src/services/design/autoRadius.ts:116-131`.
- **`ComponentFactory` defaults** match every row of `web/src/tree/kernelDefaults.ts`.
- **`getComponentGeometry`** reads each field from the kernel getter it names, after the settled build.
- **Shims.** `ApplicationPreferences` returns upstream's stock defaults for every getter the extracted code calls (Mach 0.3, launch rod, site 28.61/-80.60, ISA, WGS, RK4, 0.05 s step, 1200 s, wind 2.0/0.1); default materials match `Databases.java:51-106`. `Application.useSafetyChecks()` false matches upstream. `Injector` has one consumer (`FlightConfiguration.java:43`) and no facade path reads configuration names. `Simulation` and `OpenRocketDocument` leave out nothing the extracted physics reads.
- **Extraction counters.** Every counter in `extract --check` fails the check (missing, drifted, stale, unpatched, unblessed, leftover, no or header-only `DIVERGENCE.txt`, no `SHIMS.txt`, material drift); duplicate and orphan manifest entries fail. `manifest.txt` and `src/java` correspond exactly: 273 entries, 273 files, all present upstream. Five shims shadow upstream, matching `SHIMS.txt`.
- **Build settings.** JS and WASM-GC both build with optimization NONE and fast global analysis, no strict mode and no FP-relevant flags. There is no `-Pparity` variant: `ParityMain` compiles into every build and parity runs the vendored artifacts, so the compared variant is the shipped one.
- **Parity harness.** A target that prints nothing, crashes (no `TARGET_COMPLETE`), hangs (killed) or is truncated always fails; an empty JVM output fails; a JVM `EXCEPTION:` line fails before any golden write. Golden coverage goes well beyond the atmosphere: CP, CG, mass and inertia, bounds, fin tabs and freeform outlines, drag sweeps, supersonic aero, roll, clusters, pods, parachutes, staging, dual deploy, flights with events, the collator and UUIDs.
- **Validation floors.** 135 gated points, gate hash 1189f0ff..., floors 13 (classic) and 61 (supersonic) match both committed scorecards, and `audit.mjs` runs both models with `--check-floors`.
- **License and attribution.** No header or attribution problem was found in the patched or original files.

## Recommended order of attack

1. **Fix E6** (`committed` compares with HEAD). Every later engine change depends on this check meaning what the docs say. Small change in `audit.mjs`.
2. **Add the Node-only engine job to CI (E11):** `extract --check` and both `score.mjs --check-floors`, path-filtered. Seconds per run.
3. **Close the bless and pin holes (E7, E8, E9):** LEDGER sha cross-check, separate shim bless, clean-tree and override refusal. Each is a few lines in `extract.mjs`.
4. **Widen the validation hash (E10)** to every scoring field and the fixture components; re-record `floors.json` once.
5. **Cap the instance product and stop the radius passes early (E28, E29),** with the matching caps in `importLimits.ts`. These are the two ways a file inside today's limits stalls the tab.
6. **Fix the rail-needed offset (E1)** and add a probe test whose expected value is the closed form `maxX - guideX`.
7. **Tighten the golden flight band (E12)** and wire a fixed `golden-guard.mjs` into review (E14, E15).
8. **Small boundary fixes (E30, E32 to E35, E37, E38)** in one pass over `ComponentFactory` and `JsonLite`.
9. **Restore upstream text in the patches and write the stubby-nose LEDGER section (E40, E41),** then re-bless; fix `FinSet.getPointDescr` (E4) in the same bless.
10. **Correct the documentation (E42, E43, E44),** starting with `docs/AUDIT_PROMPT_ENGINE.md`, so the next audit is briefed on the CI that exists.
11. **Defer:** the collator corpus (E27), `LongUUID.fromString` (E39), the JDK and wrapper pins (E20), the WASM scorecard (E22), the upstream patch for E5, the opt-in OGIVE step (E3) and the gravity default (E2).
