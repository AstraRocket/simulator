import type { MotorType } from '../../engine/openRocketEngine';
import type { KeyValueStore } from '../storage/keyValueStore';
import { IndexedDbKeyValueStore } from '../storage/idbKeyValueStore';
import { JsonListStore } from '../storage/jsonListStore';
import { MIN_CURVE_SAMPLES } from './motorCurve';
import { nsKey } from '../storage/storageKeys';

export interface CustomMotor {
  id: string;
  designation: string;
  manufacturer: string;
  class: string;
  /** mm */
  diameter: number;
  /** mm */
  length: number;
  totalWeightG: number;
  propWeightG: number;
  samples: { time: number; thrust: number }[];
  /** "4,6,10,P"; a string so it can say plugged. */
  delayList?: string;
  type?: MotorType;
  /** Parallel to `samples`. */
  massesG?: number[];
  /** Launch CG from the motor's forward end. */
  cgMm?: number;
  source: 'eng' | 'rse';
}

export interface MotorStore {
  listCustomMotors(): Promise<CustomMotor[]>;
  addCustomMotor(motor: CustomMotor): Promise<void>;
  addCustomMotors(motors: readonly CustomMotor[]): Promise<void>;
  removeCustomMotor(id: string): Promise<void>;
}

const CUSTOM_MOTORS_KEY = nsKey('motors:custom');

/** Reaches `simulate()` with no second gate; NaN and Infinity do not survive the TeaVM boundary. */
export const isThrustSampleArray = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length >= MIN_CURVE_SAMPLES &&
  v.every((s) => {
    const p = s as { time?: unknown; thrust?: unknown } | null;
    return (
      !!p &&
      Number.isFinite(p.time) &&
      Number.isFinite(p.thrust) &&
      (p.time as number) >= 0 &&
      (p.thrust as number) >= 0
    );
  });

export function isCustomMotor(v: unknown): v is CustomMotor {
  const m = v as CustomMotor;
  return (
    !!m &&
    typeof m.id === 'string' &&
    typeof m.designation === 'string' &&
    // motorDb.ts localeCompares these; a missing one takes down the whole picker.
    typeof m.manufacturer === 'string' &&
    typeof m.class === 'string' &&
    Number.isFinite(m.diameter) &&
    m.diameter > 0 &&
    Number.isFinite(m.length) &&
    m.length > 0 &&
    Number.isFinite(m.totalWeightG) &&
    m.totalWeightG > 0 &&
    Number.isFinite(m.propWeightG) &&
    m.propWeightG >= 0 &&
    m.propWeightG <= m.totalWeightG &&
    isThrustSampleArray(m.samples) &&
    isMassArray(m.massesG, m.samples.length) &&
    (m.cgMm === undefined || (Number.isFinite(m.cgMm) && m.cgMm >= 0 && m.cgMm <= m.length)) &&
    (m.delayList === undefined || typeof m.delayList === 'string') &&
    (m.type === undefined || MOTOR_TYPES.has(m.type)) &&
    (m.source === undefined || m.source === 'eng' || m.source === 'rse')
  );
}

const MOTOR_TYPES: ReadonlySet<unknown> = new Set<MotorType>(['SU', 'reload', 'hybrid']);

export const isMotorType = (v: unknown): v is MotorType => MOTOR_TYPES.has(v);

const isMassArray = (v: unknown, samples: number): boolean =>
  v === undefined || (Array.isArray(v) && v.length === samples && v.every((x) => Number.isFinite(x) && x >= 0));

export class KeyValueMotorStore implements MotorStore {
  private readonly custom: JsonListStore<CustomMotor>;

  constructor(kv: KeyValueStore = new IndexedDbKeyValueStore()) {
    this.custom = new JsonListStore(CUSTOM_MOTORS_KEY, isCustomMotor, (m) => m.id, kv);
  }

  listCustomMotors(): Promise<CustomMotor[]> {
    return this.custom.list();
  }

  addCustomMotor(motor: CustomMotor): Promise<void> {
    return this.addCustomMotors([motor]);
  }

  async addCustomMotors(motors: readonly CustomMotor[]): Promise<void> {
    if (motors.length === 0) return;
    // Last id wins; reversed so the order matches single adds.
    const byId = new Map(motors.map((m) => [m.id, m]));
    await this.custom.upsert([...byId.values()].reverse());
  }

  removeCustomMotor(id: string): Promise<void> {
    return this.custom.remove(id);
  }
}

let store: MotorStore = new KeyValueMotorStore();

export function getMotorStore(): MotorStore {
  return store;
}

export function setMotorStore(next: MotorStore): void {
  store = next;
}
