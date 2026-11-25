import { describe, expect, it, vi } from 'vitest';
import { trackPoints } from '../../../src/services/flight/groundTrack';
import { windAt } from '../../../src/services/flight/flightWind';
import { flyTwoStage } from '../../testing/twoStageFlight';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

describe('the recorded wind', () => {
  it('blows the way a parachute drifts', async () => {
    const { series } = await flyTwoStage({
      series: 'full',
      windAverage: 5,
      windStdDeviation: 0,
      windDirection: Math.PI / 2,
    });
    const wind = windAt(series, 60)!;
    expect(wind.speed).toBeCloseTo(5, 1);
    expect(wind.from).toBeCloseTo(Math.PI / 2, 2);
    expect(wind.east).toBeCloseTo(-5, 1);
    const i = series.time.findIndex((t) => t >= 60);
    const points = trackPoints(series);
    const seconds = series.time[i + 40]! - series.time[i]!;
    expect((points[i + 40]!.east - points[i]!.east) / seconds).toBeCloseTo(wind.east, 0);
    expect((points[i + 40]!.north - points[i]!.north) / seconds).toBeCloseTo(wind.north, 0);
  });

  it('is nothing in a run that recorded none', () => {
    const series = { time: [0, 1], altitude: [0, 1] } as unknown as Parameters<typeof windAt>[0];
    expect(windAt(series, 0.5)).toBeNull();
  });
});
