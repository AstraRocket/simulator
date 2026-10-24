import type { FlightResult } from '../../src/engine/openRocketEngine';
import { loadEngine } from './kernelGeometry';

/**
 * The two-stage flight through the bridge: the booster separates at its
 * burnout and its chute opens there, fast; the sustainer lights a second later
 * and its chute opens near apogee.
 */
export async function flyTwoStage(): Promise<FlightResult> {
  const engine = await loadEngine();
  engine.reset();
  const h = engine.buildRocket(JSON.stringify(TWO_STAGE));
  const times = [0, 0.1, 0.3, 0.5, 1.0, 1.5, 1.85, 2.0];
  const thrusts = [0, 12.0, 6.0, 5.1, 4.9, 4.8, 4.5, 0];
  const masses = [0.024, 0.0231, 0.0215, 0.0202, 0.0174, 0.0147, 0.0133, 0.0132];
  engine.setMotorById(h, 'sustainer-mount', 'C6', 0.018, 0.07, times, thrusts, masses, 0.035, 5);
  engine.setMotorById(h, 'booster-mount', 'C6', 0.018, 0.07, times, thrusts, masses, 0.035, 0);
  engine.setMotorIgnitionById(h, 'sustainer-mount', 'burnout', 1);
  return JSON.parse(
    engine.simulateJson(h, JSON.stringify({ launchRodLength: 1, randomSeed: 7, recoverySpeedWarn: WARN })),
  ) as FlightResult;
}

/** The deployment-speed threshold for the two-stage flight (m/s). */
export const WARN = 20;

export const TWO_STAGE = {
  name: 'TwoStage',
  components: [
    {
      id: 'sus',
      type: 'stage',
      name: 'Sustainer',
      children: [
        { id: 'sn', type: 'nosecone', length: 0.07, aftRadius: 0.012, thickness: 0.002 },
        {
          id: 'sb',
          type: 'bodytube',
          length: 0.3,
          outerRadius: 0.012,
          thickness: 0.0003,
          density: 950,
          children: [
            {
              id: 'sf',
              type: 'trapezoidfinset',
              finCount: 3,
              rootChord: 0.05,
              tipChord: 0.03,
              sweep: 0.02,
              height: 0.025,
              thickness: 0.003,
            },
            {
              id: 'sustainer-mount',
              type: 'innertube',
              length: 0.07,
              outerRadius: 0.0095,
              thickness: 0.0005,
              motorMount: true,
              position: { method: 'bottom', offset: 0 },
            },
            { id: 'sustainer-chute', type: 'parachute', diameter: 0.35 },
          ],
        },
      ],
    },
    {
      id: 'boo',
      type: 'stage',
      name: 'Booster',
      separationEvent: 'burnout',
      children: [
        {
          id: 'bb',
          type: 'bodytube',
          length: 0.12,
          outerRadius: 0.012,
          thickness: 0.0003,
          density: 950,
          children: [
            {
              id: 'bf',
              type: 'trapezoidfinset',
              finCount: 3,
              rootChord: 0.05,
              tipChord: 0.03,
              sweep: 0.025,
              height: 0.035,
              thickness: 0.003,
            },
            {
              id: 'booster-mount',
              type: 'innertube',
              length: 0.07,
              outerRadius: 0.0095,
              thickness: 0.0005,
              motorMount: true,
              position: { method: 'bottom', offset: 0 },
            },
            { id: 'booster-chute', type: 'parachute', diameter: 0.25 },
          ],
        },
      ],
    },
  ],
};
