# AUDIT_PLAN - order of attack across the three audits

Date: 2026-11-09. Covers `docs/AUDIT.md` (F ids), `docs/AUDIT_DUPLICATION.md` (D ids) and `docs/AUDIT_ENGINE.md` (E ids), all run at 906513c. Where the duplication audit repeats an app finding, both ids are given (for example F16 / D11) and the item is done once.

Every batch goes through `docs/AUDIT_PROMPT_CHANGES.md` before it is called done, including the e2e suite, which the audits did not run.

## 0. Move off OpenRocket 24.12

The project targets the OpenRocket `unstable` branch at the engine's pinned commit (`engine-java/extract/UPSTREAM`) and nothing else. Today the catalog pipeline, several writer branches, the expected values of many tests and the docs still follow the 24.12 release.

- The catalog pipeline (`web/scripts/data/openrocket-release.json`, `sync-components`, `sync-preset-digests`, `sync-motor-digests`, `.github/workflows/sync-catalogs.yml`) builds against the engine commit and the parts database that commit pins, not the 24.12 jar and its database.
- The writer branches that exist only because 24.12 misreads a file (`exportSimulation.ts:29, :101`, `exportWriters.ts:298`, `exportParts.ts:153`, `docMaterials.ts:8`, `orkFile.ts:1`, `orkImport.ts:108`) follow what the engine commit's loaders read, checked with `check:ork` and `check:fields`.
- Tests whose expected values came from the 24.12 jar take them from the engine commit's build.
- The docs (`docs/AUDIT_PROMPT.md` "Which OpenRocket", `ARCHITECTURE.md`, `DEVELOPER.md`, `CODE_QUALITY.md`, `engine-java/patches/LEDGER.md`) name the engine commit.

This closes F4 (its `KNOWN` entry exists only for the 24.12 digest difference) and changes what F45 compares against.

## 1. Make the gates trustworthy

Everything after depends on these, because the fix rule needs a test that fails without the fix and a gate that reports it.

- **E6:** the engine's `committed` step compares a rebuild with a rebuild. Until it compares with what is committed, a bridge fix below (E28, E29, E1, E30 and on) could be committed unbuilt and pass.
- **E11:** a Node-only CI job running `extract --check` and both `score.mjs --check-floors`.
- **F8** (`ciTriggers` regex), **F47** (the export-reach gate counts comments), **F3** (the text gates skip `onshape/`, `design/` and the shell scripts).

## 2. Safety figures and lost work

- **F9:** the launch documents print N² impulse and the wrong certification level.
- **F16 / D11:** an update reload kills a motor guide run.
- **F1 + E28 + E29:** cap the total instance count in `importLimits` and the bridge, and stop the radius passes early.
- **E1:** the "rail needed" figure.

## 3. Files desktop reads differently

Each writer change runs `npm run audit` in `web/` for its `fields` step.

- **F12 / D18** (cleared latitude), **F14 / D15** (empty `.rkt` names), **F13 / D17** (embedded `.rse` digest).
- **F11**, then narrow its `KNOWN` entry.
- **D16** (number parsing), **D27** (wind heading fold), **D54** (private tag names).

## 4. One-line UI and unit fixes

- **F15 / D7, F22 / D2, F44 / D19, D20, F21 / D1, F18 / D5 + D21, F19 / D6.**
- **D3, D4, D22, D23, D24, D26.**
- **F17, F32, F33, F36 to F43.**

## 5. Ported geometry, each with a kernel-sourced test

- **F20 / D8 + D9** (ejection bay), **D13** (inner tube radius), **D14** (transition end radii).
- **F23, F24, F25, F27.**
- **F6 and F7:** add each case above to the generator or table it slipped past, in the same change.
- **F10** (freeform editor intersection check), last in this group.

## 6. Remaining app LOWs

F29, F30 with D12, F31, F34, F35, F28, D32.

## 7. Engine gate hardening

E7, E8, E9 (bless and pin holes), E10 (validation hash), E12, E14, E15 (golden checks), then E13 and E16 to E26.

## 8. Engine boundary LOWs

E30 to E38, in one pass over `ComponentFactory` and `JsonLite`.

## 9. Patch cleanup, re-blessed once

E40, E41, E4 and E25 together, so there is one bless and one LEDGER entry.

## 10. Decisions to record rather than code

F26 (Scale), F45 (stand-in materials, against the engine commit's library after step 0), E2 (gravity default), D38 (`<designinfo>` units).

## 11. Docs

E42 to E44 (the engine prompt describes CI jobs that do not exist), the upkeep sections of all three reports, and the `docs/CODE_QUALITY.md` figures.

## 12. Duplication consolidations

- Persistence field lists first: **D53, D51, D52, D55.**
- **D50 + D94** together, keeping the golden `.ork` bytes identical.
- The MED `DUP`, `BYPASS` and `HELPER` rows.
- **D10** (atmosphere moved to a bridge call) once the async loading state is designed.

## 13. Component extractions

D122 to D130, each with a screenshot pass.

## Deferred

E3, E5 (the upstream defect), E20, E22, E27, E39, F46.
