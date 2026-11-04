import type { Quantity } from './units';
import { degToRad, radToDeg, siToUi, uiToSi } from './units';

// Launch conditions are stored in .ork conventions (degrees, Celsius, hPa), not SI.
export interface LaunchUnitBridge {
  q: Quantity;
  toSi: (v: number) => number;
  fromSi: (v: number) => number;
}

const identity = (q: Quantity): LaunchUnitBridge => ({ q, toSi: (v) => v, fromSi: (v) => v });

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
  degC: {
    q: 'temperature',
    toSi: (v: number) => uiToSi('temperature', '°C', v),
    fromSi: (v: number) => siToUi('temperature', '°C', v),
  },
  hPa: {
    q: 'pressure',
    toSi: (v: number) => v * 100,
    fromSi: (v: number) => v / 100,
  },
  accel: identity('acceleration'),
  pressure: identity('pressure'),
  force: identity('force'),
} satisfies Record<string, LaunchUnitBridge>;

export type LaunchUnitKind = keyof typeof LAUNCH_SI;

export const SITE_ALTITUDE_FIELD = 'altitude';

export const LIMIT_FIELD = { rodAngle: 'angle', windSpeed: 'speed' } as const;
