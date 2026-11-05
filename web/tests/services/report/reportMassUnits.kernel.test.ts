import { beforeAll, describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import i18n from '../../../src/i18n';
import { __setEngineForTests, motorStatistics } from '../../../src/engine/openRocketEngine';
import { C6 } from '../../../src/engine/api';
import { buildConfiguredRocket } from '../../../src/services/design/buildRocket';
import { defaultRocketTree } from '../../../src/services/design/defaultRocket';
import { newFlightConfig } from '../../../src/services/flight/flightConfigs';
import { configMotors, type ReportModel } from '../../../src/services/report/reportModel';
import { writeMotorsSection } from '../../../src/services/report/motorsSection';
import { createPdfPage, summaryRows, type T } from '../../../src/services/report/pdfPage';
import type { ReportOptions } from '../../../src/services/report/options';
import { METRIC_UNITS, UNITS, type Quantity, type UnitSelection } from '../../../src/prefs/units';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });
beforeAll(async () => {
  __setEngineForTests(await loadEngine());
});

const t = i18n.getFixedT('en') as unknown as T;
const inUnit = (quantity: Quantity, symbol: string, si: number): number =>
  si / UNITS[quantity].find((u) => u.symbol === symbol)!.toSI;
function expectTwoFigures(text: string, symbol: string, exact: number): void {
  expect(text.endsWith(` ${symbol}`)).toBe(true);
  const shown = Number(text.slice(0, -symbol.length).replace(/,/g, ''));
  const halfUnitOfSecondFigure = 0.5 * 10 ** (Math.floor(Math.log10(Math.abs(exact))) - 1);
  expect({ text, exact, within: Math.abs(shown - exact) <= halfUnitOfSecondFigure }).toEqual({
    text,
    exact,
    within: true,
  });
}

function page(units: UnitSelection) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const runs: string[] = [];
  const text = doc.text.bind(doc);
  doc.text = ((...a: Parameters<typeof text>) => {
    const s = a[0];
    runs.push(...(Array.isArray(s) ? s : [s]).map(String));
    return text(...a);
  }) as typeof doc.text;
  return { p: createPdfPage(doc, t, {} as ReportOptions, units), runs };
}

const tree = defaultRocketTree();
const config = newFlightConfig({ mount: { spec: C6 } }, 'C6', 'c6');

describe.each([
  ['kg', 'N·s'],
  ['lb', 'lbf·s'],
])('the report in %s and %s', (mass, impulse) => {
  const units: UnitSelection = { ...METRIC_UNITS, mass, impulse };

  it('prints the loaded and empty masses to at least two figures', () => {
    const info = buildConfiguredRocket(tree, config).staticInfo();
    const rows = new Map(summaryRows(page(units).p, info));
    expect(info.mass).toBeGreaterThan(info.massEmpty);
    expectTwoFigures(rows.get(t('report.massLoaded'))!, mass, inUnit('mass', mass, info.mass));
    expectTwoFigures(rows.get(t('report.massEmpty'))!, mass, inUnit('mass', mass, info.massEmpty));
  });

  it('prints the motor table impulse and weight to at least two figures', () => {
    const info = buildConfiguredRocket(tree, config).staticInfo();
    const motors = configMotors(tree, config, buildConfiguredRocket);
    const { p, runs } = page(units);
    writeMotorsSection(p, { configs: [{ name: 'C6', motors, flight: null }] } as unknown as ReportModel);
    const stats = motorStatistics(C6.times.map((time, i) => [time, C6.thrusts[i]!]))!;
    const impulses = runs.filter((r) => r.endsWith(` ${impulse}`));
    expect(impulses).toHaveLength(2);
    for (const cell of impulses) expectTwoFigures(cell, impulse, inUnit('impulse', impulse, stats.totalImpulse));
    const weights = runs.filter((r) => r.endsWith(` ${mass}`));
    expect(weights).toHaveLength(2);
    for (const cell of weights) expectTwoFigures(cell, mass, inUnit('mass', mass, info.mass - info.massEmpty));
  });
});
