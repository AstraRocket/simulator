import { PLUGGED_DELAY, type MotorSpec } from '../../engine/openRocketEngine';
import { roundTo } from '../app/numbers';

/** `ThrustCurveMotor.getDelayString`. `P` is not translated: it is the letter on the casing. */
export function delayString(delay: number): string {
  if (delay >= PLUGGED_DELAY) return 'P';
  return String(roundTo(delay, 1));
}

export function motorName(spec: Pick<MotorSpec, 'designation' | 'code'>): string {
  return spec.code || spec.designation;
}

export function motorFullName(spec: Pick<MotorSpec, 'designation' | 'code' | 'manufacturer'>): string {
  return spec.manufacturer ? `${spec.manufacturer} ${motorName(spec)}` : motorName(spec);
}

export function motorDesignation(spec: Pick<MotorSpec, 'designation' | 'code' | 'ejectionDelay'>): string {
  if (!spec.designation) return '';
  return `${motorName(spec)}-${delayString(spec.ejectionDelay)}`;
}
