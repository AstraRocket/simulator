import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { __setEngineForTests, type MotorSpec } from '../../../src/engine/openRocketEngine';
import { motorStats } from '../../../src/services/report/rocketReport';
import { powerClass } from '../../../src/services/flight/powerClass';
import { loadEngine } from '../../testing/kernelGeometry';
import { catalogMotorSpec } from '../../../src/services/motors/motorSpec';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  __setEngineForTests(await loadEngine());
});

async function apogeeC6(): Promise<MotorSpec> {
  const rows = JSON.parse(
    readFileSync(join(__dirname, '../../../public/data/motors.generated.json'), 'utf8'),
  ) as CatalogMotor[];
  const row = rows.find((r) => r.manufacturer === 'Apogee' && /^C6\b/.test(r.designation))!;
  return catalogMotorSpec(row, 6);
}

// ThrustCurveMotor.computeStatistics: burn spans the 5%-of-peak crossings (Motor.MARGINAL_THRUST).
describe('motorStats', () => {
  it("prints the kernel's burn time and average thrust for the Apogee C6", async () => {
    const spec = await apogeeC6();
    const m = motorStats(spec);
    expect(m.burnTime).toBeCloseTo(1.2, 1);
    expect(m.avgThrust).toBeCloseTo(8.3, 1);
    expect(m.burnTime).toBeLessThan(spec.times[spec.times.length - 1]!);
    expect(m.designation).toMatch(/^C6/);
  });

  it('states no burn or average for a curve the kernel cannot build, without failing', async () => {
    const one = { ...(await apogeeC6()), times: [0], thrusts: [5], masses: [0.02] } as unknown as MotorSpec;
    const m = motorStats(one);
    expect(Number.isNaN(m.burnTime)).toBe(true);
    expect(Number.isNaN(m.avgThrust)).toBe(true);
    expect(() => powerClass([{ spec: one, count: 1 }], 0.1)).not.toThrow();
    const none = { ...one, times: [], thrusts: [], masses: [] } as unknown as MotorSpec;
    expect(() => powerClass([{ spec: none, count: 1 }], 0.1)).not.toThrow();
  });

  it('reads the peak of a curve too long to spread into Math.max', async () => {
    const n = 1_000_000;
    const times = Array.from({ length: n }, (_, i) => i / 1000);
    const thrusts = times.map((_, i) => (i === 1234 ? 99 : 5));
    const m = motorStats({ ...(await apogeeC6()), times, thrusts } as unknown as MotorSpec);
    expect(m.maxThrust).toBe(99);
  });
});
