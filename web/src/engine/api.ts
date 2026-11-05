import { OpenRocketDesign, resetEngine, type MotorSpec, type RocketTree } from './openRocketEngine';

export type { StaticInfo, FlightResult } from './openRocketEngine';

/** Must match the catalog row (`motorSpec.samplesToMotorSpec`) exactly so both fly the same. */
export const C6: MotorSpec = {
  designation: 'C6',
  manufacturer: 'Estes',
  diameter: 0.018,
  length: 0.07,
  times: [
    0, 0.031, 0.092, 0.139, 0.192, 0.209, 0.231, 0.248, 0.292, 0.37, 0.475, 0.671, 0.702, 0.723, 0.85, 1.063, 1.211,
    1.242, 1.303, 1.468, 1.656, 1.821, 1.834, 1.847, 1.86,
  ],
  thrusts: [
    0, 0.946, 4.826, 9.936, 14.09, 11.446, 7.381, 6.151, 5.489, 4.921, 4.448, 4.258, 4.542, 4.164, 4.448, 4.353, 4.353,
    4.069, 4.258, 4.353, 4.448, 4.448, 2.933, 1.325, 0,
  ],
  masses: [
    0.0231, 0.023082, 0.0228664, 0.0224415, 0.0216616, 0.0213958, 0.0211421, 0.0210012, 0.0206875, 0.0201903, 0.0195878,
    0.0185427, 0.0183757, 0.0182637, 0.0175938, 0.0164458, 0.0156566, 0.0154967, 0.0151857, 0.0143155, 0.0133022,
    0.0124032, 0.0123445, 0.0123105, 0.0123,
  ],
  cgX: 0.035,
  ejectionDelay: 5.0,
};

/** resetEngine() frees the previous design's handles, so always rebuild before reading or simulating. */
export function buildRocketTree(tree: RocketTree): OpenRocketDesign {
  resetEngine();
  return OpenRocketDesign.buildTree(tree);
}
