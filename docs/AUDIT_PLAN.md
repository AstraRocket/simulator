# AUDIT_PLAN - order of attack across the three audits

Date: 2026-11-13. Covers `docs/AUDIT.md` (F ids), `docs/AUDIT_DUPLICATION.md` (D ids) and `docs/AUDIT_ENGINE.md` (E ids), all run at 228b0a2. Where two audits report the same defect, both ids are given (for example F5 / D2) and the item is done once.

Every batch goes through `docs/AUDIT_PROMPT_CHANGES.md` before it is called done, including the e2e suite, which the audits did not run. `npm run audit` in `web/` and in `engine-java/` was not run by the audits either; a failing step from either run goes in at step 1.

## 1. Make the gates trustworthy

Everything after depends on these, because the fix rule needs a test that fails without the fix and a gate that reports it.

- **E6:** the engine's `committed` step compares a rebuild with a rebuild. Until it compares with what is committed, an engine fix below (E31, E1) could be committed unbuilt and pass.
- **E11:** a Node-only CI job running `extract --check` and both `score.mjs --check-floors`, path-filtered.
- **E13, E7, E8, E9:** the extraction holes. Scan every source root and pin the manifest list, cross-check the LEDGER on bless, bless shims separately, and pin upstream by content.
- **E10, E14, E17:** widen the validation hash and harden `floors.json`; re-record it once.
- **F1, F2:** narrow the `KNOWN` entries in `check-desktop-fields.mjs` and add the embedded-motor and stage-figure samples.
- **F3 with F25:** the export-reach gate counts a same-named identifier as a use.

## 2. Safety figures and lost work

- **E31:** pod sets get past the automatic-radius run cap and freeze the tab. Count the run along the kernel's line on both sides (`ComponentFactory` and `importLimits.ts`), with a pinned test.
- **F5 / D2:** the launch documents count a grounded booster's motors and recovery gear.
- **F6:** a flutter fin stock carries over to the next design.
- **D7:** the motor card's "has a curve" test.
- **E1:** the "rail needed" figure, with a probe test whose expected value is `maxX - guideX`.
- **F7:** lookup-table simulations get a keyed import note and an outdated summary.

## 3. Files desktop reads differently

Each writer change runs `npm run audit` in `web/` for its `fields` step.

- **F9** (gravity model and humidity always written), **F10** (fairing), **F11** (unnamed pod sets and boosters), **F12** (hex, binary and octal numbers), **D15** (wind heading not reduced to 0..360).

## 4. One-line UI fixes

- **F8** (saved-part Auto switches), **D6** (bore field), **D4** (path export site fallback), **D3** (material overwrite), **D10** (`shearModulusOf`).
- **D13, D14, F15, F16, F17, F18, F19, F22.**

## 5. Units and labels

**D1** (one table of scoped flight figures, with a screenshot pass with the unit chips set), **D8** (`fmtCalibers` and one locale key), **D20.**

## 6. Ported geometry, each with a kernel-sourced test

- **D5** (aft ring holes around a cluster), **D9** (`finCountOf`), **D16**, **D17**, then **D11** (`groundPointAt`).
- **F13, F21.**
- **F4:** add each case above to the generator or table it slipped past, in the same change.

## 7. Remaining app LOWs

F14 (follow desktop or record the choice), F20, F23, E32.

## 8. Engine golden discipline

E12, E15, E16, E18: an exact same-platform compare, an honest rewrite report and a working golden guard.

## 9. Engine boundary LOWs

E33 to E40 in one pass over `ComponentFactory` and `JsonLite`, and the dead exports in E41.

## 10. Patch cleanup, blessed once

E43, E44, E4, E27 and the comment hunk in E48 together, so there is one bless and one LEDGER entry.

## 11. Decisions to record rather than code

F26 (Scale), F45 (stand-in materials), E2 (gravity default).

## 12. Docs

E45 to E47, starting with `docs/AUDIT_PROMPT_ENGINE.md` so the next engine audit is briefed on the CI that exists; the upkeep sections of all three reports; the `docs/CODE_QUALITY.md` figures from `npm run metrics`.

## 13. Duplication consolidations

- **D18** (ISA constants and the geopotential conversion) in one module, pinned by `recoverySizing.test.ts`.
- The MED `DUP` and `BYPASS` rows (D19, D21 to D26, D50 to D55), one module at a time, then the LOW rows.

## 14. Component extractions

D87 (`useBusyAction`), D88 (`selectClass`), D89 (`FigureRow`), then the LOW `COMPONENT` rows, each with a screenshot pass.

## Deferred

E3, E5 (the upstream defect), E19 to E26 not covered above, E28, E29, E30, E42, F24 (waits for the next preset data change).
