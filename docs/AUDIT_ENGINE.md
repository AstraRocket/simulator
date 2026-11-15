# AUDIT_ENGINE - `engine-java/` audit (AstraRocket)

<!-- cspell:ignore misroute scalings reassociated Descr serieslens unhashed gatehash undercount unkeyed -->

Date: 2026-11-13. Branch `dev` at 228b0a2. Run per `docs/AUDIT_PROMPT_ENGINE.md`: five parallel review agents, one per slice (patches, the `src/api` facade, shims and the JDK stub, build and extraction, the gates). The coordinator then spot-checked the new MED claims against the code. Merged here, replacing the 2026-11-09 report (E1 to E44 at 906513c).

Paths and line numbers are as of 228b0a2. If one does not match, search for the quoted expression.

## How to read this

- **Pinned upstream was obtained.** `engine-java/extract/UPSTREAM` pins `2d76b9733a1c1ccd5e59eddc7f778a15a803cc34` (2026-11-04). `engine-java/.openrocket-src/.git/HEAD` reads exactly that SHA (confirmed by reading the file; no git command was run). Whether that worktree is clean could not be confirmed without git, but all 19 upstream sha256 values in `DIVERGENCE.txt` and all 5 in `SHIMS.txt` were recomputed from it and match. Every patch was diffed against the file at the same path there, and every patch finding cites the upstream line.
- **IDs are fresh.** The "Was" field names the 2026-11-09 id, so `docs/AUDIT_PLAN.md` can be mapped across.
- **VERIFIED** means the cited lines were read and the claim confirmed, by a probe (named) or by a second reading. **REPORTED** means plausible and cited, but not confirmed that way.
- Severity markers: 🔴 correctness in shipped physics, 🟠 gates and build integrity, 🟡 API boundary and untrusted input, 🟢 documentation drift and dead weight. **⬆ UPSTREAM** marks a defect in verbatim OpenRocket code: the fix belongs in a patch or upstream, never as an in-place edit to `src/java`.
- `RASAeroDragCalculator` and `RASAeroStabilityCalculator` are out of scope, as the prompt states.

## Status

| Category                               | HIGH  | MED    | LOW    | UPSTREAM | Total  |
| -------------------------------------- | ----- | ------ | ------ | -------- | ------ |
| 🔴 Correctness in shipped physics      | 0     | 1      | 3      | 1        | 5      |
| 🟠 Gates and build integrity           | 0     | 8      | 17     | 0        | 25     |
| 🟡 API boundary and untrusted input    | 0     | 1      | 11     | 0        | 12     |
| 🟢 Documentation drift and dead weight | 0     | 0      | 6      | 0        | 6      |
| **Total**                              | **0** | **10** | **37** | **1**    | **48** |

No HIGH finding. No unexplained hunk changes physics on the default (flags-off) path.

### Old findings

| Old id                             | Status                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| E28 (instance product cap)         | **Fixed.** `ComponentFactory.checkSize` (`:110-191`) and `importLimits.checkBuildSize` (`:89-104`) agree; `long` arithmetic, no overflow.        |
| E29 (radius passes)                | **Fixed** (early exit at `OpenRocketEngine.java:733-754`). Its stated bound ("slowest design inside both limits builds in about 0.8 s") is not true: see E31. |
| E30 (freeform point magnitude)     | **Fixed.** `ComponentFactory.java:354-359`; a `-1e300` point is refused (probe).                                                                |
| E36 (wrapper comment)              | Comment **fixed**; the null-argument divergence is still open as E38.                                                                          |
| E42, E43                           | **Partly fixed** (prompt `:19` count, `sync-catalogs.yml:18-19`); the rest open as E45, E46.                                                   |
| All other old ids                  | **Still open.** Old E1 to E13 keep their numbers; then old to new: E14 to E16, E15 to E18, E16 to E17, E17 to E19, E18 to E20, E19 to E21, E20 to E22, E21 to E23, E22 to E24, E23 to E25, E24 to E26, E25 to E27, E26 to E28, E27 to E29, E31 to E32, E32 to E33, E33 to E34, E34 to E35, E35 to E37, E36 to E38, E37 to E39, E38 to E40, E39 to E42, E40 to E43, E41 to E44, E42 to E45, E43 to E46, E44 to E47. |

## Gates run in this pass

| Gate                                                    | Result                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node validation/score.mjs --check-floors` (both models) | Pass: classic 13/135, supersonic 61/135, gate hash `1189f0ff...` (recomputed independently). Output byte-identical to the committed scorecards. Both scores sit exactly on their floors.                                                   |
| `extract --check --src .openrocket-src`                 | Pass, run from **scratch copies** only (with `--src` the git provisioning path is never reached; read from code first). Patch-side checks also reproduced by hand: patch equals `src/java`, load-bearing, in the manifest, hashes match. |
| Pinned upstream diff                                    | 19 patch files diffed hunk by hunk against `2d76b97` (`diff -u --strip-trailing-cr`; upstream is CRLF, patches LF).                                                                                                                      |
| Probes                                                  | Vendored `.mjs` and `.wasm` run in Node for E31, E36 to E41; a JDK 21.0.12 probe for E26, E27, E42; scratch copies of `extract/` and `validation/` for E6 to E13, E14, E19, E24, E30. Nothing in the repo was edited.                   |

**Not run, pending the user's `npm run audit` in `engine-java/`:** `parity` (both targets and the golden compare), the `committed` rebuild check, the `date` step (needs git), `extract --check` against the repo itself (it shells out to git to provision the cache), and any Gradle or TeaVM build. The golden was checked statically only (its sha and counts).

## Patch hunk classification

77 hunks, the same as at 906513c. All 19 patch files are load-bearing (each `src/java` file differs from upstream) and byte-equal to `src/java`; all 19 are in `manifest.txt` and `DIVERGENCE.txt`; no leftovers. Counts: 36 `PATCH(` markers (astrarrocketjs 27, offaxis-roll-inertia 3, teavm-format-g 2, teavm-uuid 2, drogue-low-speed 1, teavm-mutable-trace 1) and 47 `PATCH (` markers (RASAero 42, stubby-nose floor 5). Every tag except "stubby-nose floor" resolves to the LEDGER (E44).

| File                         | Hunks | TeaVM compat | RASAero / opt-in | Documented deliberate               | Unexplained       |
| ---------------------------- | ----- | ------------ | ---------------- | ----------------------------------- | ----------------- |
| FinSetCalc                   | 12    | 0            | 8                | 1 (header)                          | 3 (cosmetic, E43) |
| SymmetricComponentCalc       | 11    | 0            | 8                | 1 header, 2 stubby-nose floor (E44) | 0                 |
| BarrowmanDragCalculator      | 7     | 2            | 4                | 1 header                            | 0                 |
| BarrowmanStabilityCalculator | 5     | 3            | 1                | 1 header                            | 0                 |
| MassCalculation              | 2     | 0            | 0                | 1 (offaxis-roll-inertia)            | 1 (comment, E43)  |
| RingComponent                | 1     | 0            | 0                | 1 (offaxis-roll-inertia)            | 0                 |
| FinSet                       | 3     | 2            | 1                | 0                                   | 0                 |
| FreeformFinSet               | 4     | 3            | 0                | 1 (outlineRefused)                  | 0                 |
| FlightConfiguration          | 2     | 1            | 0                | 1 (motors LinkedHashMap)            | 0                 |
| InstanceMap                  | 2     | 2            | 0                | 0                                   | 0                 |
| FlightConfigurationId        | 4     | 4            | 0                | 0                                   | 1 comment (E48)   |
| MotorConfigurationId         | 3     | 3            | 0                | 0                                   | 0                 |
| BasicEventSimulationEngine   | 2     | 1            | 0                | 1 (drogue-low-speed)                | 0                 |
| SimulationOptions            | 9     | 9            | 0                | 0                                   | 0                 |
| BoundingBox                  | 4     | 4            | 0                | 0                                   | 0                 |
| Unit                         | 2     | 2            | 0                | 0                                   | 0                 |
| ArrayList                    | 1     | 1            | 0                | 0                                   | 0                 |
| ComponentAssembly            | 1     | 1            | 0                | 0                                   | 0                 |
| Mutable                      | 2     | 2            | 0                | 0                                   | 0                 |

The compatibility hunks were interrogated and are sound:

- **`instanceof` chain** (`BarrowmanDragCalculator.java:556-576`, `BarrowmanStabilityCalculator.java:432-452`, replacing upstream `Reflection.construct` at Drag `:507-511`, Stab `:405-409`): exhaustive over Trapezoid, Elliptical and Freeform fin sets, TubeFinSet, LaunchLug, RailButton, NoseCone, Transition, BodyTube, Rocket, AxialStage, ParallelStage and PodSet. Branches are disjoint (TubeFinSet and LaunchLug extend Tube, not FinSet), `TubeCalc` is abstract, and nothing in `src/shims` or `src/api` subclasses these.
- **`Geo2D`**: token for token the JDK `Line2D` algorithm; a 4.2M-case JDK probe (random, collinear, endpoint-touching, signed zero, subnormal, 1e300, NaN, Infinity) found 0 mismatches against `Line2D.linesIntersect` and `intersectsLine`; `distance` is bit-equal to `Point2D.distance` except NaN payloads, which `FreeformFinSet.java:609` cannot observe.
- **`"%g"` to `"%s"`** in `BasicEventSimulationEngine` (ours 607-611, upstream 607-608): reaches `log.info` only.
- **`PATCH(drogue-low-speed)`** (ours 675-683, upstream 673-680): only the comment markers were removed.
- **`ConcurrentLinkedQueue` to `LinkedList`**: nothing in `src/java`, `src/shims` or `src/api` starts a thread, executor, timer or parallel stream.
- **`InstanceMap` order**: upstream's order comes from random UUIDs, so there is no fixed upstream order to match; the patch gives tree-walk order.
- **Jet damping (new in the 2026-11-04 pin)**: `computeJetDampingCoefficient` (`AbstractSimulationStepper.java:391-416`) sums over `getActiveMotors()`, fed from the patched `LinkedHashMap` in `FlightConfiguration` (`:723-736`), so the patches make that sum deterministic. It divides by longitudinal inertia (`AbstractRKSimulationStepper.java:338`) and does not touch the roll-inertia patches.
- **Flags-off bit identity**: FinSetCalc, SymmetricComponentCalc and BarrowmanDragCalculator reduce to upstream's expressions with the RASAero flags off. The only divergences arise when an intermediate is NaN (the stubby guard, the boattail reassociation at ours `294-302` / upstream `225-230`), which real geometry cannot produce.

---

## 🔴 Correctness in shipped physics

### E1 | MED | The "rail needed" figure is too short when the rod is shorter than the guide-to-aft distance | VERIFIED | Was E1

`engine-java/src/api/java/api/RailSpeedProbe.java:49-51` with `GuideClearanceListener.java:105-111`. The offset is `realRodLength - effectiveRodLength(rod)`, and `travel()` clamps at 0, so the offset is `min(rod, maxX - guideX)` instead of `maxX - guideX`. The 906513c probe (1.0 m rocket, lug 0.05 m from the top: rod 0.3 m reports 0.996 m against a true 1.586 m) still applies: the code is unchanged.
**Why it matters:** a safety figure is understated by up to `(maxX - guideX) - rod`. The rail-exit warning stays correct. Opt-in (`guideAwareRodClearance`, default false).
**Fix:** compute the offset as `maxX - guideX` from a helper that does not take the rod; NaN when there is no lug and no two-station button line.

### E2 | LOW | Constant gravity defaults to 9.80665 where desktop uses 9.807 | VERIFIED | Was E2

`OpenRocketEngine.java:1406`; web `web/src/services/motors/motorMath.ts:4` (`G0`), used by `EarthModelSection.tsx:48-49` and `exportSimulation.ts:106`. Desktop's default is 9.807 (upstream `ApplicationPreferences.java:783-784`), and the shim matches it (`ApplicationPreferences.java:92-94`), but the facade never reads the shim.
**Fix:** 9.807 on both sides, or record 9.80665 as deliberate in the LEDGER.

### E3 | LOW | Opt-in supersonic OGIVE wave drag steps at the end of upstream's table | VERIFIED (code and arithmetic) | Was E3

`SymmetricComponentCalc.java:360-371, :562-566` (ours) / upstream `:324-326`. Upstream builds the OGIVE table from the equivalent-cone value `1/sqrt(1+4f^2)` (to about M3.98); above it, with `supersonicAero` on, the `analyticNose` continuation still uses `sinphi`, the joint angle (0 for a tangent ogive). A tangent-ogive transition of fineness 2 goes from about 0.155 times the frontal ratio to 0 at the table end.
**Why it matters:** opt-in and above M4, but discontinuous; LEDGER `:1427-1428` says the opt-in branches are "otherwise unchanged", which is what produces the step.
**Fix:** use the equivalent-cone value in the OGIVE `analyticNose` branch, or record the step as accepted.

### E4 | LOW | `FinSet.getPointDescr` still formats with `%g` | VERIFIED (TeaVM source) | Was E4

`FinSet.java:1716` (ours) / upstream `:1641`. Reached through `FinSet.toDebugDetail()` from `RocketComponent.java:1529` when an axial offset is NaN. TeaVM 0.15.0 `TFormatter` has no `g` conversion (its default branch throws `UnknownFormatConversionException`, `TFormatter.java:253` in the cached classlib sources jar), so on that path the intended `BugException` is replaced by a format exception (an uncaught trap on WASM-GC). E37's NaN leaks make the path reachable.
**Fix:** concatenate, as `FreeformFinSet` does, and re-bless.

### E5 | UPSTREAM ⬆ | Nozzle exit area is summed in a random order | VERIFIED (code reading) | Was E5

`FlightConditions.java:164, :212-216`, `AbstractSimulationStepper.java:148`, consumed at `AbstractRKSimulationStepper.java:222` (all verbatim, so upstream lines are the same). `getThrustingNozzleExitArea()` sums a `HashMap<ComponentAssembly, Double>` keyed by a random-UUID hash (`RocketComponent.java:1331, :2874`).
**Why it matters:** with three or more assemblies thrusting at once and nozzle exit diameters set, thrust can differ by an ulp from run to run and between JVM and TeaVM. Parity cannot see it: only `flight.mindia` has a nozzle exit. Now the only unordered physics sum in this area (jet damping is ordered by the patches).
**Fix:** a patch using `LinkedHashMap` at `FlightConditions:45, :164, :524` and `AbstractSimulationStepper:148`.

## 🟠 Gates and build integrity

### E6 | MED | The `committed` step compares a rebuild with a rebuild, never with what is committed | REPORTED (code; audit not run) | Was E6

`engine-java/audit.mjs:24-31, :58-59`; `test/parity/parity.mjs:41`; `build-engine.mjs:92`; `gradle.properties:6, :15`. `parity` runs first and re-vendors fresh artifacts; `committed` then hashes those and builds again, which the build cache and configuration cache make up to date. Demonstration: edit `src/api/java/api/OpenRocketEngine.java`, do not rebuild, run `npm run audit`: every step passes, and the only trace is a modified binary in the working tree. The `scorecards` step likewise scores the fresh build, not the committed one.
**Why it matters:** `engine-java/README.md:167` and `build.gradle:65-69, :101-105` rely on this step to catch an unbuilt engine edit, and nothing in CI ties the deployed binary to source (E11).
**Fix:** hash the vendored files before `parity` (or against the committed copy); run the second build with `--rerun-tasks --no-build-cache` if determinism is the intent.

### E7 | MED | A bless can hide a physics change the LEDGER does not explain | VERIFIED (demonstrated) | Was E7

`extract/extract.mjs:258-292`. Scratch demonstration: change `FinSetCalc.java:223` `cna = cna1 * ...` to `cna = 0.97 * cna1 * ...` in `patches/` and `src/java`; `--check` fails (1 unblessed); `--bless` rewrites `DIVERGENCE.txt`; `--check` passes; `LEDGER.md` untouched. `DIVERGENCE.txt` can also be edited by hand; a bless is not privileged.
**Fix:** record each patch's sha prefix in its LEDGER entry and have `--check` require every `DIVERGENCE.txt` patch sha to appear in `LEDGER.md`.

### E8 | MED | One bless also accepts upstream movement under every shim | VERIFIED (demonstrated) | Was E8

`extract/extract.mjs:329-349`. Scratch demonstration: append a line to upstream `preferences/ApplicationPreferences.java` in a copied tree (`--check`: "upstream changed since this shim was reviewed"), edit an unrelated patch, one `--bless`: its LEDGER template names only FinSetCalc, it rewrites `SHIMS.txt`, and `--check` passes.
**Fix:** a separate `--bless-shims`, or refuse a bless while shims are flagged.

### E9 | MED | The upstream tree is trusted without a content check, and an override bypasses the pin | VERIFIED (demonstrated) | Was E9

`extract/extract.mjs:74, :97-102`; `audit.mjs:60`. The cache is trusted on `rev-parse HEAD === ref` alone; `--src` and `OPENROCKET_SRC` skip the pin; `audit.mjs` inherits the environment. Scratch demonstration: set `ExtendedISAModel.java:42` to 298.15 in both a copied upstream tree and `src/java`: `--check --src <copy>` and `OPENROCKET_SRC=<copy> --check` both pass.
**Fix:** record a content sha of the 273 upstream manifest files (in `UPSTREAM` or `DIVERGENCE.txt`) and verify it on every source path, which is offline and covers `--src`; have `audit.mjs` refuse an override.

### E10 | MED | The validation gate hash leaves out fields that set the scored values | VERIFIED (demonstrated) | Was E10

`validation/score.mjs:190-191` (hash inputs) against `:141-145` (unhashed). `refAreaScale`, `aoaDeg`, `machAlt`, `maxMach` and `fixture` are outside the hash. Scratch demonstration: hb2 `refAreaScale` 2.56 to 2.3 raises classic 13 to 17 and supersonic 61 to 64 with the same hash `1189f0ff...` and exit 0; basic-finner `aoaDeg` 2 to 0 drops supersonic to 49, hash unchanged.
**Why it matters:** with E17 (a count, not a set), an unhashed edit buys 3 or 4 points of headroom that absorb a real regression elsewhere, with the ratchet green.
**Fix:** hash every per-anchor scoring field plus a sha of each fixture file; re-record `floors.json` once.

### E11 | MED | No CI job checks the engine, and the master deploy ships the vendored binary | VERIFIED | Was E11

`.github/workflows/gates.yml:10-12` (jobs: build-and-test, housekeeping, unit, repo, e2e, website); `deploy.yml:85`. No workflow runs `extract --check`, parity, the rebuild or `score.mjs`. The trade-off is stated in `gates.yml` and the README.
**Assessment:** the JDK and time cost justify leaving out parity and the rebuild, but `extract --check` (about 1 s, Node only, offline with `--src` or a cached tree) and both `score.mjs --check-floors` (seconds) do not need a JDK. With E6, nothing anywhere verifies the shipped binary; an unblessed patch edit merges green.
**Fix:** a path-filtered job (`engine-java/**`, `web/src/engine/vendor/**`, `web/public/engine/**`) running `extract --check` and both floor checks.

### E12 | MED | The golden check uses the cross-target flight tolerance for a same-JVM comparison | REPORTED (arithmetic from golden values) | Was E12

`test/parity/parity.mjs:103-110, :118-124`. Non-flight lines are exact (`:119`); `flight.*` lines pass within 3e-3 relative or 6e-5 absolute, `flight.conditions.*` 6e-3, `serieslens` 5 samples unscaled. Apogee 330.676 m can move about 0.99 m, ground hit at 102.16 s about 0.31 s, and `flight.rows|700.0` passes for 698 to 702; the 2026-11-04 repin changed exactly that (702 to 700, `LEDGER.md:1449`). Demonstration (reasoned): a blessed patch scaling `WGSGravityModel` gravity by 1.002 moves only `flight.*` lines by about 0.2% and passes the golden; parity stays green because all three targets agree.
**Trade-off:** documented as G8 (`LEDGER.md:834-842`, headroom over 1.9e-3 cross-OS drift), but `parity.mjs:280-281` already knows the recording platform and only prints it.
**Fix:** exact match when `platform()` equals the recorded platform; keep the band only across platforms.

### E13 | MED | A verbatim upstream file can be replaced through `src/api/java` with no bless | VERIFIED (scratch `--check`; compile not run) | Was E13 (LOW, latent)

`extract/extract.mjs:294-298` scans only `src/shims/java` for shadowing; `build.gradle:40-42, :63` also compile `src/api/java` and `test/` into the main source set. Demonstration: delete the `info/openrocket/core/models/atmosphere/ExtendedISAModel.java` line from `manifest.txt`, move the file to `src/api/java/info/openrocket/core/models/atmosphere/` with `STANDARD_TEMPERATURE = 298.15`: `extract --check: OK`, exit 0, no bless needed. The same move into `src/shims/java` is caught, but one bless clears it.
**Why it matters:** unlike E7, this needs no `DIVERGENCE.txt` change at all; the only trace is a manifest line removal.
**Fix:** scan every main source root by declared package and class; pin a sha of the manifest's file list in `DIVERGENCE.txt` so dropping an entry needs a bless.

### E14 | LOW | `floors.json` has no shape check, so a renamed key switches its check off | VERIFIED (demonstrated) | New

`validation/score.mjs:41-44, :223, :228, :234`. A missing key reads as `undefined` and the `!= null` guards skip that check. Scratch demonstration: rename `gateHash` to `gatehash` and widen `arcas-short` `cd-supersonic-tunnel` `tol` from 0.02 to 10: `--check-floors` exits 0 on both models (19/135 and 66/135, hash now `7d7f5a6e...`). Dropping `min.supersonic` turns that floor off the same way.
**Assessment:** LOW rather than MED because the documented override (editing `gateHash`) is already a one-line `floors.json` change; the rename only makes it look less like one.
**Fix:** under `--check-floors`, require `gates`, `gateHash` and both `min` values with the right types and reject unknown keys.

### E15 | LOW | A golden rewrite reports in-band drift as "no values moved" | REPORTED (code) | New

`test/parity/parity.mjs:216-222`. In `--golden` mode only out-of-band moves are counted, so each rewrite resets the baseline and in-band flight drift accumulates (three rewrites carrying 0.9 m of apogee each total 2.7 m, each reported as unchanged).
**Fix:** in golden mode, list every non-exact line as moved, banded moves separately.

### E16 | LOW | `golden-guard.mjs` is run by nothing and keys lines wrongly | VERIFIED (replay) | Was E14

`test/parity/golden-guard.mjs:27`. No npm script, `audit.mjs` step or workflow calls it; it keys by `split('|')[0]`, although 367 values sit under 173 keys (`roll.forces` and `roll.lateral` 36 each); replayed on an identical golden it reports 194 moved values.
**Fix:** key by tag plus ordinal and wire it into review of `golden.txt` changes.

### E17 | LOW | The validation floor is a pass count, not a set | REPORTED | Was E16

`validation/score.mjs:234`. A change that fails one gated point and newly passes another holds the count. See E10.
**Fix:** record the passing set and require a superset.

### E18 | LOW | `--golden` skips the line-count check | VERIFIED (code) | Was E15

`test/parity/parity.mjs:216-237` against `:265`; header `lines=` (`:251`) is never read; `npm run parity:golden` passes no `--expect-lines`. A scenario dropped from `ParityMain` writes a shorter golden that matches its own sha and exits 0.
**Fix:** enforce the count in golden mode and cross-check `lines=`.

### E19 | LOW | The pruned-export guard is vacuous for four names | VERIFIED (grep on vendored files) | Was E17

`build-engine.mjs:66-76`. `\bname\b` over the whole artifact matches `free` (string literal, 3 JS / 8 WASM hits), `reset` (8 / 10), `setSupersonicAero` (13 JS hits from the calculator setters, contradicting the comment at `:69`) and `setMotorById` (an error-string literal).
**Fix:** match the `export {` clause for JS and `WebAssembly.Module.exports` for WASM, with the list derived from the `@JSExport` methods.

### E20 | LOW | Shim contents are never hashed | VERIFIED (demonstrated) | Was E18

`extract/extract.mjs:294-327, :396-440`; `src/shims/java/info/openrocket/core/database/Databases.java:33-45`. `SHIMS.txt` records only the upstream sha. Scratch demonstration: `ApplicationPreferences.getConstantGravityValue()` 9.807 to 9.70 and `--check` stays green with no bless; likewise Cardboard 680 to 690 in `Databases`. The material check compares `materials.generated.json` with upstream, not with the shim the kernel uses. The densities match upstream today (upstream `Databases.java:51, 54, 70, 76, 81, 87, 95, 106`).
**Fix:** a shim content sha column in `SHIMS.txt`, or compare the shim's `case` densities with the parsed upstream table.

### E21 | LOW | Nine readers of `UPSTREAM` disagree on a duplicated key | VERIFIED (demonstrated) | Was E19

Last `ref =` wins in `web/vite.config.ts:52-59` and `website/docusaurus.config.ts:28-36`; the first wins in `extract.mjs:43`, `audit.mjs:35`, `web/scripts/sync-examples.mjs:16`, `web/scripts/lib/openrocketJava.mjs:22`, `web/tests/services/storage/exampleLibrary.test.ts:42`, `reference/provision.mjs:23` and `web/tests/services/app/appInfo.test.ts:28-31`. Appending a second `ref =` to a copy: the gate readers see `2d76b9733`, About and the docs show the other.
**Fix:** one shared parser that rejects duplicate keys.

### E22 | LOW | The JDK update, the Gradle distribution and the TeaVM artifacts are not pinned | REPORTED | Was E20

`build.gradle:92-107`; `gradle/wrapper/gradle-wrapper.properties:3`. Vendor and major only (Adoptium 21); no `distributionSha256Sum`; no `gradle/verification-metadata.xml` or lock for the TeaVM 0.15.0 plugin and libraries that compile into the shipped engine; the wrapper jar is not validated. No paths or timestamps were found in the vendored output.
**Fix:** pin or record the JDK update, add `distributionSha256Sum` and dependency verification.

### E23 | LOW | The JVM reference, the build and the audit steps run with no timeout | REPORTED | Was E21

`test/parity/parity.mjs:32-47`; `audit.mjs:14`. Only the TeaVM targets get the 2-minute kill; a hang fails closed but blocks.
**Fix:** a timeout on each call.

### E24 | LOW | Validation scores the JS engine only | VERIFIED (code) | Was E22

`validation/score.mjs:12-14`. The app loads WASM-GC by default; the fixtures' `machAlt` and `aoaDeg` sweeps never run on WASM.
**Fix:** score the WASM target too, or add the fixtures to `ParityMain`.

### E25 | LOW | `anchors.json` has no schema check, and `--record-expect` rewrites pins silently | VERIFIED (code) | Was E23

`validation/score.mjs:91-197, :112-122`. A missing tolerance crashes at `tol.toFixed` (`:194`, fails closed); points beyond `maxMach` or below 0.05 clamp silently in `interp` (`:74-75`; none exist today); `--record-expect` rewrites all four fixture pins with one stderr line each.
**Fix:** validate keys, types, exactly one tolerance and the Mach range.

### E26 | LOW | `--bless` exits 1 after a successful write | VERIFIED (demonstrated) | Was E24

`extract/extract.mjs:456-458, :472`. Problems are counted before the write: "blessed 19 patch divergence(s)" then exit 1; the next `--check` exits 0.
**Fix:** recount after the write.

### E27 | LOW | The two largest patches carry no `PATCH(` marker | VERIFIED | Was E25

`FinSetCalc.java` (21 markers) and `SymmetricComponentCalc.java` (25) use only `PATCH (` with a space, which the unpatched regex (`extract.mjs:172`, `/PATCH\(/`) and the 36 count skip. No gate impact: drift and the `DIVERGENCE.txt` hashes still catch a revert.
**Fix:** normalize the markers or use `/PATCH\s*\(/`.

### E28 | LOW | Nothing pins `Geo2D` to `java.awt.geom` | VERIFIED (JDK probe) | Was E26

`src/shims/java/info/openrocket/core/util/Geo2D.java:10-45`. It matches the JDK today (4.2M cases, 0 mismatches), but no JVM test references `Line2D`, and an earlier `hypot` defect here was found only by an audit (LEDGER 2026-09-19).
**Fix:** turn the probe into a JVM-only check.

### E29 | LOW | The `Collator` stub's header and LEDGER overstate what is checked | VERIFIED (JDK probe) | Was E27

`src/jdkstubs/java/text/Collator.java:6` ("must match JDK 21 ... checked by ParityMain"); `patches/LEDGER.md:741-749` ("0 of 1369"; the corpus is now 28 names, 784 pairs per strength, `ParityMain.java:104-109`). The 906513c probe still stands (punctuation outside `_ / . '` sorts by code point), but new evidence lowers the stakes: the stub matches the JDK on the whole shipped motor database (876 designations, 27 manufacturers, all four strengths, 0 disagreements), and no shipped output depends on collation (`ThrustCurveMotor.compareTo` and `AlphanumComparator` have no callers).
**Fix:** reword both to "matches on the parity corpus and the shipped motor list".

### E30 | LOW | Manifest duplicate detection compares raw strings | VERIFIED (demonstrated) | New

`extract/extract.mjs:111-118`. `/info/openrocket/core/util/MathUtil.java` (leading slash) or `a//b` passes as a second entry: `--check` OK, reporting 274 manifest files against 273. No correctness hole (removing the canonical line flags the file as stale), only a wrong count.
**Fix:** `path.posix.normalize`, strip a leading `/`, then deduplicate.

## 🟡 API boundary and untrusted input

### E31 | MED | The automatic-radius run cap is bypassed through pod sets, and `getStaticInfo` then freezes the tab | VERIFIED (probe, both targets) | New

`ComponentFactory.java:134-141` and `web/src/services/files/ork/importLimits.ts:97-99`. Both sides count the run in depth-first tree order, and a sized part inside a pod set resets it (`totals[2] = 0`). The kernel's chain does not see that reset: `SymmetricComponent.getPreviousSymmetricComponent` walks the main-line siblings, and takes a pod's last child only when it is flush and inline. So "16 automatic tubes, then a tube carrying a pod set (radiusOffset 0.05) holding a sized tube", repeated, is one unbroken automatic chain while every counted run is 16 or less. Measured on the vendored engine: a 300-tube chain in 337 parts (30 KB JSON, inside every cap on both sides) builds in 1.0 s (JS) / 0.8 s (WASM-GC), then `getStaticInfo` takes **60 s on JS and 50 s on WASM-GC**; the same tree with sized tubes takes 69 ms / 33 ms. Growth is about N^2.7; the 1,000-part budget allows a chain near 890 (extrapolated to many minutes). The plain 17-tube case is refused correctly.
**Why it matters:** `staticInfo()` runs on the main thread on import (`loadOrk.ts:297`) and on every rebuild (`services/design/buildRocket.ts:50`), so a crafted `.ork` freezes the tab, which the import limits exist to prevent. It also makes the E29 (old) resolution's "about 0.8 s" bound untrue.
**Fix:** count the run along the kernel's line: save the counter before recursing into a `podset` or `parallelstage`, recurse with 0, restore afterward. Change both sides together and pin the pattern in `engineBoundary.test.ts` and `designFile.test.ts`.

### E32 | LOW | The kernel's 8M-character cap counts passthrough the kernel ignores | REPORTED | Was E31

`JsonLite.java:14`; `web/src/engine/openRocketEngine.ts:669` sends the whole tree, including `xmlExtra`, `docExtra` and `documentMaterials`; `MAX_PASSTHROUGH` (`passthrough.ts:194`) caps element count, not size. An `.ork` with one 9 MB unknown element parses in JS, then fails to open with the kernel's size message.
**Fix:** strip passthrough before sending, or add a serialized-size check with a keyed message.

### E33 | LOW | Duplicate ids are accepted and the later part wins | VERIFIED (probe) | Was E32

`ComponentFactory.java:838-841`; `OpenRocketEngine.java:229-232`. `setMotorById`, `getComponentInfo` and the settle passes then address only the last part.
**Fix:** refuse a duplicate id.

### E34 | LOW | Three wrong-typed fields fall back silently | VERIFIED (probe, both targets) | Was E33

`ComponentFactory.java:723` with `JsonLite.java:298-301` (`"position":"top"` builds at the default), `:241-244` (`"clipped":"yes"` ignored), `:336-337` (`"points":5` builds the default outline). Contradicts the "refused, not defaulted" policy (`JsonLite.java:254`).
**Fix:** throw `wrongType` when the key is present with the wrong type.

### E35 | LOW | `JsonLite` accepts input strict JSON rejects | VERIFIED (probe) | Was E34

`JsonLite.java:155-156` (raw U+0001, raw lone surrogate), `:165` (fullwidth hex digits in `\u` escapes), `:226` (`Character.isWhitespace`, so U+000B).
**Fix:** reject characters below 0x20, check surrogates on raw characters, accept JSON whitespace and ASCII hex only.

### E36 | LOW | A huge decimal exponent wraps under TeaVM and parses as an ordinary number | VERIFIED (probe, both targets) | New

`JsonLite.java:184-193` (`Double.parseDouble`). On both TeaVM targets `1e4294967297` parses as 10 and `2e-4294967295` as 20; `1e2147483648` and `1e4294967296` give 0 or 1. The JDK gives Infinity (refused) or 0. The value slips past the non-finite guard and `MAX_MAGNITUDE`, and it is a JVM/TeaVM divergence parity never feeds. The app cannot produce it (`JSON.stringify` of a JS number never does); only a raw-text caller can.
**Fix:** in `isJsonNumber`, reject an exponent of more than 4 significant digits.

### E37 | LOW | Second-line guards let Infinity and NaN through | VERIFIED (probe) | Was E35

`OpenRocketEngine.java:445` (`applyMotor` accepts an Infinity diameter or length: stability becomes null; nothing checks `ejectionDelay`: NaN gives "EJECTION_CHARGE event has a NaN time!"); `:714-731` (`setShoulderLength` accepts NaN and -1). The app's `curveProblem` (`motorCurve.ts:10-26`) blocks the motor cases; `setShoulderLength` is test-only.
**Fix:** `positiveArg` for sizes, finite or +Infinity for the delay, `nonNegativeArg` for the shoulder.

### E38 | LOW | A null string argument fails differently per target | VERIFIED (probe) | Was E36

`setShoulderLength` with a null side: JS "(JavaScript) TypeError: Cannot read properties of null (reading '$nativeString')", WASM "NullPointerException". `setMotorIgnitionById` with a null event: JS a plain `TypeError` (not a `JavaError`), WASM `JavaError` "(could not fetch message)". `callEngine` wraps both, so a user sees only different wording. The wrapper comment (`openRocketEngine.ts:48-50`) is fixed.
**Fix:** null checks with named messages.

### E39 | LOW | `getComponentMasses` turns a non-finite mass into 0 | VERIFIED (code) | Was E37

`OpenRocketEngine.java:901-911` with `num()` at `:917-919`, while `getStaticInfo` and the sweep emit null. A broken part shows a plausible 0 kg row.
**Fix:** emit null.

### E40 | LOW | Smaller boundary inconsistencies | VERIFIED (probe or code) | Was E38, plus two new

- `ComponentFactory.java:874-900`: the settle passes look parts up by id, so a node without an id is never re-settled.
- `OpenRocketEngine.java:502`: `setMotorIgnitionById` accepts a negative delay (probe log "Armed @: -5.0"); a tree's must be non-negative, and the import path clamps (`importConfigs.ts:126, :131`).
- `ComponentFields.java:287-296` against `OpenRocketEngine.java:1783-1806`: two escapers; a comment `a\bb\fc\u0001d` reads back from `getComponentFields` as `a b c d`.
- `OpenRocketEngine.java:1063-1079, :1130-1141`: `machAlt` rows are not checked to ascend (wrong interpolation, no out-of-bounds).
- New: `OpenRocketEngine.java:1751, :1757`: `appendBranchSeries` escapes the symbol, then `appendSeries` escapes it again (latent; no symbol has `"` or `\`).
- New: `ComponentFactory.java:173` / `importLimits.ts:54`: `engineblock` `instanceCount` is counted and range-checked (1 to 64) although `EngineBlock` is not `LineInstanceable` and the field is never applied, so a stray 0 refuses a build over an ignored field.

### E41 | LOW | Unused facade exports | VERIFIED (grep) | Was the E44 note

`web/src` calls 17 exports. Never called by the app: `newRocket`, the `addX` builders (`OpenRocketEngine.java:339-420`, whose handles outlive `free(rocket)`), `setMotor`, `simulate`, `free`, `setSupersonicAero`, `setRogersModifiedBarrowman`, `setStubbyNoseDrag`, `getComponentFields`, `getComponentGeometry`, `setShoulderLength`. Tests and scripts use some of them; the RASAero flags cannot be reached from the app UI.
**Fix:** drop the `addX` builders and `newRocket`; mark the rest test-only in the README.

### E42 | LOW | `LongUUID.fromString` does not reproduce the JDK | VERIFIED (JDK probe) | Was E39

`src/shims/java/info/openrocket/core/util/LongUUID.java:35-49`. `"0-10000-0-0-0"` gives `00000001-...` (JDK `00000000-...`); `"0-0-0-0-1234567890123"` keeps an extra digit; `"0-0-0-0-0-"` and a 37-character string are accepted where the JDK throws. Dead code: nothing calls `FlightConfigurationId(String)`. Correction to the old wording: the patch comment at `FlightConfigurationId.java:3-8` names only `toString`, `hashCode`, `equals` and `compareTo`, which match the JDK (0 mismatches over 1M pairs, exact round trip); the over-claim is the shim header at `LongUUID.java:3`.
**Fix:** port the JDK masks and length check, or delete `fromString` and narrow the header.

## 🟢 Documentation drift and dead weight

### E43 | LOW | Unexplained comment and placement hunks in two physics patches | VERIFIED | Was E40

- `MassCalculation.java:397-400` (ours) / upstream `386-390`: comment reworded, no marker, no LEDGER mention; it is why `DIVERGENCE.txt` reads 32 against the LEDGER's "19 to 23".
- `FinSetCalc.java:261, :267-270` / upstream `158-164` (older comment text); `calculateNacaApplicabilityWeight` moved to ours `:673` with its reverse-flow Javadoc paragraph dropped / upstream `553-582`; blank and whitespace lines at ours about `:322, :731-760, :1038` / upstream `213, 602-616, 749`.

No behavior change, but "every hunk is explained" is false here. **Fix:** restore upstream's text and placement, keep only the RASAero hunks, re-bless.

### E44 | LOW | The stubby-nose floor has no LEDGER section | VERIFIED | Was E41

`SymmetricComponentCalc.java:84, :91, :635, :664-671, :707` (five `PATCH (stubby-nose floor)` markers; "stubby-nose floor" has 0 hits in `LEDGER.md`, whose row `:64` says only "RASAero #1 Phase 1"). The default-path restructure of upstream's three early returns (upstream `411-421`) into one guard is called "the exact negation" at `:669`, which fails only under NaN (unreachable for real geometry).
**Fix:** a LEDGER section, the row updated, the comment reworded.

### E45 | LOW | The engine audit prompt describes CI jobs, a build variant and counts that do not exist | VERIFIED | Was E42

`docs/AUDIT_PROMPT_ENGINE.md`: `:68` "18 hand-edited" (19; inconsistent with its own `:19`, which is fixed); `:20, :121-123` 5 `src/api` files, about 3.9k lines (7 files, 3,772 lines: OpenRocketEngine 1807, ComponentFactory 993, ComponentFields 317, JsonLite 302, GuideClearanceListener 170, RailSpeedProbe 92, AtmosphereProfile 91); `:21-22` shims about 850 lines and the stub 187 (621 and 121); `:49` "green parity job" (none); `:63, :224` `gates.yml` reads the ref (it holds no ref and no engine job); `:218-219` a parity rebuild-and-diff step (only the local E6 step); `:222` a `-Pparity` variant (none; `ParityMain` compiles into every build); `:236` 362 golden lines (367); `:243-247` a `validate` job in `gates.yml` (none); `:150` `web/src/tree/schema.ts` (does not exist).

### E46 | LOW | The README, LEDGER, developer guide, build comments and validation docs describe CI checks and a variant that are gone | VERIFIED | Was E43

- `engine-java/README.md:22, :39`: 18 overrides and 255 verbatim (19 and 254); `:167`: `npm run audit` "fails if the committed artifacts differ" (E6); `:75, :82`: presents `newRocket`, `addX` and `setMotor` as the app's API (E41) and says every exception crosses "carrying the Java message" (false for nulls, E38); `:182`: the golden "checks every value", silent on the 3e-3 flight band.
- `engine-java/patches/LEDGER.md:32, :101-103, :204, :610, :923, :1039`: CI jobs (`reproducible`, a parity `git diff`, `validate`) with no entry recording their removal; `:214-216` a "255-line" golden compared "with the same tolerances as the cross-platform check" (superseded by G8 at `:834`); `:844-849`: build-engine asserts "contains no ParityMain", a check that no longer exists.
- `docs/DEVELOPER.md:337, :351`: a `-Pparity` variant and "the shipped engine carries no test code" (`build.gradle:57-63` compiles `ParityMain` into every build); `:27` "CI pins 21.0.12" (only sync-catalogs' OpenRocket build does).
- `engine-java/build.gradle:62` (about 2%; the README says 3%), `:142-143` ("bit-identical"; flight lines use a band); `gradle-wrapper.properties:5-6` ("the parity job").
- `validation/floors.json:3` and `validation/README.md:23, :58, :70, :90-91`: "CI ratchet"; only `npm run audit` runs it.
- Fixed: `.github/workflows/sync-catalogs.yml:18-19` now says "(run by hand)".

### E47 | LOW | `UPSTREAM`'s header omits five of its readers | VERIFIED | Was E44

`engine-java/extract/UPSTREAM:10-16` does not list `reference/provision.mjs`, `web/scripts/lib/openrocketJava.mjs`, `web/tests/services/app/appInfo.test.ts` or `web/tests/services/storage/exampleLibrary.test.ts`, and names `audit.mjs` only in the prose at `:6`.

### E48 | LOW | Small dead weight in shims and patches | VERIFIED (grep, diff) | New

- `Databases.java:37-40`: the `Balsa`, `Plywood (birch)`, `Fiberglass` and `Polystyrene` cases are unreachable (the only two-argument `findMaterial` callers ask for Delrin, Cardboard, Ripstop nylon and Elastic cord), and `densityFor` ignores the material type. Four hand-copied numbers with no consumer and no check (E20).
- `FlightConfigurationId.java:58` (ours): fixes upstream's typo "builds he id"; a comment-only hunk outside the LEDGER, like E43.
- `OpenRocketEngine.java:894`: two statements on one line.

---

## Checked and sound

- **Handle lifecycle.** Every build path calls `reset()` first; the counter never wraps (`:85`) and `reset` does not rewind it (`:164`); `get(handle, kind)` checks the type; a stale handle gives "Unknown handle"; the wrapper's generation guard (`openRocketEngine.ts:655-665`) throws `StaleDesignError`.
- **`JsonLite`.** Depth 64 holds on both targets; duplicate keys, leading zeros, `+`, `.3` and `1e999` are refused; escaped surrogates are paired; unterminated input throws; 4M digits parse in about 95 ms.
- **JSON output.** Every double goes through `num`/`nums`/`appendSeries`/`Out.num` and emits null for NaN and Infinity (except E39); every user and kernel string is escaped. A name with `"`, `\`, U+2028 and NUL gives replies `JSON.parse` accepts on both targets.
- **Size caps (E28 old).** Kernel and app share the algorithm and constants (1,000 parts, 20,000 instances, run 16); `long` arithmetic; the app's `countOf` clamps never undercount the kernel. Non-`.ork`/`.rkt` paths skip the app check but the kernel still enforces it (English, unkeyed message). The one hole is E31.
- **Automatic radii in `ComponentFactory`.** A flipped nose cone's `setFlipped` runs before `setBaseRadiusAutomatic` (`:212, :226-228`), matching `NoseCone.java:54-97` and `autoRadius.ts:116-124`; a transition end with no radius is automatic (`:247-258`), matching `autoRadius.ts:126-131`.
- **`ComponentFactory` defaults** match every row of `web/src/tree/kernelDefaults.ts`; unknown types, shapes, finishes, methods, clusters and airfoils are refused.
- **`getComponentGeometry`** (`:767-854`) reads each field from the kernel getter it names after the settled build, matching `web/tests/testing/kernelGeometry.ts`; launch lugs return length only, since their radii are explicit.
- **Shims.** `ApplicationPreferences` returns upstream's core defaults for every getter the extracted code calls; `Application.useSafetyChecks()` false matches upstream; `Injector` has one consumer (`FlightConfiguration.java:43`) whose output reaches only `toString`; lean `Simulation` and `OpenRocketDocument` omit nothing extracted physics reads; `LongUUID` `equals`/`hashCode`/`compareTo`/`toString` match the JDK, and ids are minted per build, never parsed from a file; on the JVM the real `Collator` wins, so parity's JVM leg is a true reference.
- **Extraction counters.** Every `--check` counter fails the check (missing, drift, stale, unpatched, unblessed, leftover, missing or header-only `DIVERGENCE.txt`, shim moved, missing `SHIMS.txt`, material drift); orphan patches, raw duplicates and unparseable lines die. No single bad manifest entry turns it green; the only green case is dropping an entry together with its file, which is the enabler of E13. `manifest.txt` (282 lines, 7 comments, 273 unique entries) and `src/java` (273 files) correspond exactly in both directions, all present upstream. Five shims shadow upstream, matching `SHIMS.txt`. The `describe` suffix is checked against `ref` (`extract.mjs:50-57`).
- **Build settings.** JS and WASM-GC both use optimization NONE and fast global analysis, strict off, no FP-relevant flags, UTF-8 forced. No `-Pparity` variant exists; parity runs the vendored artifacts, so the compared variant is the shipped one (whether the committed binary is that build is E6). No paths or timestamps in the vendored output.
- **Parity harness.** Empty, crashed (no `TARGET_COMPLETE`), truncated and hung targets fail; empty JVM output fails; an `EXCEPTION:` line fails before any golden write; a missing golden, header or sha mismatch fails. The `stdout-sync` fallback can only truncate, never pass falsely. Golden: 367 values under 173 keys, header sha recomputed and matching; coverage spans roll (76), aero (73), flight (62), ISA, quaternions, fins, components, mass, staging, clusters, pods, parachutes, the collator and UUIDs.
- **Validation.** 135 gated points (52 informational), gate hash recomputed and matching; `audit.mjs` runs both models; `score.mjs` checks fixture `_expect` shape and the aero pins at Mach 0.5 and 2.0.
- **License and attribution.** No header or attribution problem found in patched or original files.

## Defects a web-app user would see

These belong in the web audit as well: E31 (a crafted 30 KB `.ork` freezes the tab for about a minute on import and on every edit), E32 (an `.ork` with large unknown elements does not open), E1 (the opt-in "rail needed" figure is understated), E2 (constant gravity differs from desktop by 3.5e-5 relative).

## Recommended order of attack

1. **Patch diffs first:** nothing unexplained changes physics, so the patch slice sets no new priorities. Clean the patches in one bless later (step 9).
2. **Fix E31** (count the radius run along the kernel's line, both sides, with a pinned test). It is the one way a file inside today's limits stalls the tab.
3. **Fix E6** (`committed` compares with what is committed). Every later engine change depends on it.
4. **Add the Node-only engine job to CI (E11):** `extract --check` and both `score.mjs --check-floors`, path-filtered.
5. **Close the extraction holes (E13, E7, E8, E9):** scan every source root and pin the manifest list, LEDGER sha cross-check, separate shim bless, upstream content sha.
6. **Widen the validation hash and harden `floors.json` (E10, E14, E17)**; re-record `floors.json` once.
7. **Fix the rail-needed offset (E1)** with a probe test whose expected value is `maxX - guideX`.
8. **Golden discipline (E12, E15, E16, E18):** exact same-platform compare, honest rewrite report, a working `golden-guard.mjs`.
9. **One patch bless (E43, E44, E4, E27, E48's comment hunk),** with a LEDGER entry; record E2 as a decision.
10. **Boundary LOWs (E32 to E40, E36)** in one pass over `ComponentFactory` and `JsonLite`; drop dead exports (E41).
11. **Documentation (E45, E46, E47),** starting with `docs/AUDIT_PROMPT_ENGINE.md` so the next audit is briefed on the CI that exists.
12. **Defer:** E3, E5 (upstream patch), E19 to E26 not already covered, E28, E29, E30, E42.
