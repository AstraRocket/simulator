import type { Quantity } from './units';
import { degToRad, radToDeg, siToUi, uiToSi } from './units';

// Launch conditions are stored in .ork conventions (degrees, Celsius, hPa), not SI.
export interface LaunchUnitBridge {
  q: Quantity;
  toSi: (v: number) => number;
  fromSi: (v: number) => number;
}

const identity = (q: Quantity): LaunchUnitBridge => ({ q, toSi: (v) => v, fromSi: (v) => v });
const stored = (q: Quantity, sym: string): LaunchUnitBridge => ({
  q,
  toSi: (v) => uiToSi(q, sym, v),
  fromSi: (v) => siToUi(q, sym, v),
});

export const LAUNCH_SI = {
  length: identity('length'),
  distance: identity('distance'),
  windspeed: identity('windspeed'),
  velocity: identity('velocity'),
  mass: identity('mass'),
  motorDimensions: identity('motorDimensions'),
  deg: {
    q: 'angle',
    toSi: (v: number) => degToRad(v),
    fromSi: (v: number) => radToDeg(v),
  },
  degC: stored('temperature', '°C'),
  hPa: stored('pressure', 'hPa'),
  accel: identity('acceleration'),
  pressure: identity('pressure'),
  force: identity('force'),
} satisfies Record<string, LaunchUnitBridge>;

export type LaunchUnitKind = keyof typeof LAUNCH_SI;

export const SITE_ALTITUDE_FIELD = 'altitude';

export const LIMIT_FIELD = { rodAngle: 'angle', windSpeed: 'speed' } as const;
