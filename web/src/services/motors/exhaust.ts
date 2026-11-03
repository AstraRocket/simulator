import type { MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { collectNodes, stageNodes } from '../../tree/treeWalk';
import type { FlightConfig } from '../flight/flightConfigs';
import type { CatalogMotor } from './motorDb';

/**
 * How a motor's exhaust looks in the 3D flight: the flame's three colors from
 * the nozzle out, how thick a smoke trail it leaves, the smoke's color, and
 * whether it throws sparks. A look, not a measurement: it is picked from the
 * propellant's name so a Blackjack flight reads as one at a glance.
 */
export interface Exhaust {
  /** Flame colors: at the nozzle, the middle, the flared edge. */
  flame: readonly [string, string, string];
  /** Smoke opacity at the nozzle, 0 (none) to 1. */
  smoke: number;
  smokeColor: string;
  sparks: boolean;
}

/** The looks, by name: `classic` is the default, the rest are matched from the propellant. */
export const EXHAUST_IDS = [
  'classic',
  'powder',
  'sparky',
  'smoky',
  'white',
  'blue',
  'red',
  'green',
  'fast',
  'hybrid',
] as const;
export type ExhaustId = (typeof EXHAUST_IDS)[number];

/**
 * The delay grain's smoke between burnout and the ejection charge: a thin,
 * pale tracking trail, much the same whatever the propellant was, since the
 * delay grain is its own slow-burning composition.
 */
export const DELAY_SMOKE: Pick<Exhaust, 'smoke' | 'smokeColor'> = { smoke: 0.35, smokeColor: '#cfcdc6' };

/** The flame the scene drew before propellants had a look: an orange composite. */
export const DEFAULT_EXHAUST: Exhaust = {
  flame: ['#fff4cf', '#ffb020', '#ff4d10'],
  smoke: 0.45,
  smokeColor: '#d8d8d4',
  sparks: false,
};

/**
 * The looks, matched in order against the propellant's name, lowercased: the
 * first whose words appear wins, so "White Lightning/Warp 9" reads as White
 * Lightning and "Super White Lightning" is not taken for a "Super" fast one.
 */
const LOOKS: readonly { id: ExhaustId; words: readonly string[]; look: Exhaust }[] = [
  {
    id: 'powder',
    words: ['black powder'],
    look: { flame: ['#fff0c0', '#ffa040', '#e05010'], smoke: 0.8, smokeColor: '#c9c6bf', sparks: true },
  },
  // Metal-salt sparks first: Skidmark is a Blackjack base, but its sparks are its look.
  {
    id: 'sparky',
    words: ['skidmark', 'metalstorm', 'spitfire', 'cocktail'],
    look: { flame: ['#fff6d8', '#ffb43a', '#ff6a1a'], smoke: 0.4, smokeColor: '#bdb8ae', sparks: true },
  },
  {
    id: 'smoky',
    words: ['black jack', 'blackjack', 'black max', 'black lightning', 'black bear', 'dark matter', 'smoky', 'dirty'],
    look: { flame: ['#ffd9a0', '#ff8a2a', '#c8400c'], smoke: 0.85, smokeColor: '#4a4743', sparks: false },
  },
  {
    id: 'white',
    words: ['white', 'c-star'],
    look: { flame: ['#ffffff', '#fff2c8', '#ffc060'], smoke: 0.75, smokeColor: '#f2f2ee', sparks: false },
  },
  {
    id: 'blue',
    words: ['blue', 'typhoon'],
    look: { flame: ['#f2eeff', '#8f7bff', '#5a3cff'], smoke: 0.15, smokeColor: '#dcdce4', sparks: false },
  },
  {
    id: 'red',
    words: ['red', 'pink'],
    look: { flame: ['#fff0e8', '#ff5a3c', '#d01c1c'], smoke: 0.4, smokeColor: '#e0d4d0', sparks: false },
  },
  {
    id: 'green',
    words: ['green'],
    look: { flame: ['#f4fff0', '#8cff5a', '#2fbf2a'], smoke: 0.45, smokeColor: '#d8e0d4', sparks: false },
  },
  // Fast, hot, clean composites.
  {
    id: 'fast',
    words: ['warp', 'vmax', 'imax', 'fast', 'super thunder', 'propellant x', 'rapid'],
    look: { flame: ['#ffffff', '#fff6d0', '#ffd070'], smoke: 0.2, smokeColor: '#e8e8e4', sparks: false },
  },
  // Hybrids burn a plastic grain in nitrous: a pale flame and next to no smoke.
  {
    id: 'hybrid',
    words: ['nitrous', 'hybrid', 'tribrid'],
    look: { flame: ['#f4f8ff', '#bcd4ff', '#7aa0ff'], smoke: 0.05, smokeColor: '#e8ecf0', sparks: false },
  },
];

/** Every look, the default first, in the order the gallery shows them. */
export const EXHAUST_LOOKS: readonly { id: ExhaustId; look: Exhaust }[] = [
  { id: 'classic', look: DEFAULT_EXHAUST },
  ...LOOKS.map(({ id, look }) => ({ id, look })),
];

type MotorLook = Pick<CatalogMotor, 'propInfo' | 'sparky' | 'type'>;

/**
 * Which look a catalog motor takes: by its propellant's name, else hybrid for a
 * hybrid, else the default.
 */
export function exhaustIdFor(motor: MotorLook | undefined): ExhaustId {
  if (!motor) return 'classic';
  const name = (motor.propInfo ?? '').toLowerCase();
  const hit = name ? LOOKS.find((l) => l.words.some((w) => name.includes(w))) : undefined;
  return hit?.id ?? (motor.type === 'hybrid' ? 'hybrid' : 'classic');
}

/** The look for a catalog motor (`exhaustIdFor`). The catalog's `sparky` flag adds sparks to any look. */
export function exhaustFor(motor: MotorLook | undefined): Exhaust {
  const id = exhaustIdFor(motor);
  const look = EXHAUST_LOOKS.find((l) => l.id === id)!.look;
  return motor?.sparky && !look.sparks ? { ...look, sparks: true } : look;
}

/**
 * One look per burn, in the order the burns happen: the bottom stage lights
 * first, so the stages are read bottom up, each by the first of its motors the
 * catalog knows. A stage with nothing seated has no burn and no look.
 *
 * `find` is how a seated motor is looked up in the catalog (`findSeated`),
 * passed in so this stays free of the dialog that owns it.
 */
export function burnExhausts(
  tree: RocketTree,
  config: FlightConfig,
  catalog: readonly CatalogMotor[],
  find: (catalog: CatalogMotor[], spec: MotorSpec) => CatalogMotor | undefined,
): Exhaust[] {
  const out: Exhaust[] = [];
  for (const stage of [...stageNodes(tree)].reverse()) {
    const seated = collectNodes([stage], (n) => n.motorMount === true)
      .map((m) => config.motors[m.id as string])
      .filter((m) => m != null);
    if (!seated.length) continue;
    const rows = seated.map((m) => find(catalog as CatalogMotor[], m.spec));
    out.push(exhaustFor(rows.find((r) => r != null)));
  }
  return out;
}
