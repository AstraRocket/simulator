import type { Quantity } from './units';
import { degToRad, radToDeg, siToUi, uiToSi } from './units';

/**
 * The bridge between `LaunchConditions` and SI.
 *
 * Launch conditions are stored in the .ork's own conventions, which are not all
 * SI: angles in degrees, temperature in Celsius, pressure in hPa. Everything
 * else in the app hands SI to the unit helpers, so these fields convert here
 * and nowhere else.
 *
 * It lives in its own module rather than inside LaunchPanel because it is pure
 * arithmetic (an offset conversion for the temperature, like the .ork writer's
 * and reader's for the launch temperature), and out of a component it can be
 * unit-tested without rendering anything.
 */
export interface LaunchUnitBridge {
  /** Which preference group the field is shown in. */
  q: Quantity;
  /** Stored value → SI. */
  toSi: (v: number) => number;
  /** SI → stored value. */
  fromSi: (v: number) => number;
}

const identity = (q: Quantity): LaunchUnitBridge => ({ q, toSi: (v) => v, fromSi: (v) => v });

export const LAUNCH_SI = {
  /** Launch-rod length: already meters. */
  length: identity('length'),
  /** Site and layer altitudes: already meters. */
  distance: identity('distance'),
  /** Wind speed and gusts: already m/s. */
  windspeed: identity('windspeed'),
  /** Descent rates and rail exit speeds (Tools): already m/s, shown as a velocity. */
  velocity: identity('velocity'),
  /** Masses (Tools): already kilograms. */
  mass: identity('mass'),
  /** Rod angle, rod direction, wind direction: stored in degrees. */
  deg: {
    q: 'angle',
    toSi: (v: number) => degToRad(v),
    fromSi: (v: number) => radToDeg(v),
  },
  /** Air temperature: stored in Celsius, SI is kelvin (the units table's °C). */
  degC: {
    q: 'temperature',
    toSi: (v: number) => uiToSi('temperature', '°C', v),
    fromSi: (v: number) => siToUi('temperature', '°C', v),
  },
  /** Air pressure: stored in hectopascals, SI is pascals. */
  hPa: {
    q: 'pressure',
    toSi: (v: number) => v * 100,
    fromSi: (v: number) => v / 100,
  },
  /** Constant gravity: already m/s^2. */
  accel: identity('acceleration'),
} satisfies Record<string, LaunchUnitBridge>;

export type LaunchUnitKind = keyof typeof LAUNCH_SI;

/**
 * The launch field name the site's elevation goes by, so its unit chip has one
 * scope (`unitScope('launch', SITE_ALTITUDE_FIELD)`) wherever the elevation of
 * a site is typed or listed: the launch panel, the location dialogs and the
 * Tools pages. A user working in feet sees feet in all of them.
 */
export const SITE_ALTITUDE_FIELD = 'altitude';

/**
 * The launch field names the safety-code caps are quoted under, so the hint
 * under the launch panel's box and the Run notice for the same cap both read
 * the unit that field's chip chose.
 */
export const LIMIT_FIELD = { rodAngle: 'angle', windSpeed: 'speed' } as const;
