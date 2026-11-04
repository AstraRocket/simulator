import { describe, it, expect } from 'vitest';
import {
  COMPONENT_PART_KEYS,
  componentName,
  warningText,
  warningHelp,
  warningKeyOf,
} from '../../../src/services/app/warningText';
import { localeTranslator } from '../../testing/localeTranslator';
import en from '../../../src/i18n/locales/en.json';
import es from '../../../src/i18n/locales/es.json';

// Returns the key for unknown keys, as i18next does without a `defaultValue`.
const t = (key: string) => (key === 'warn.DISCONTINUITY' ? 'Body diameter discontinuity' : key);

describe('warningText', () => {
  it('translates the key and keeps the component names', () => {
    expect(warningText('[Warning.DISCONTINUITY]:  "Nose cone", "Body tube"', t)).toBe(
      'Body diameter discontinuity: "Nose cone", "Body tube"',
    );
  });

  it('keeps a measured value, which is the detail worth reading', () => {
    expect(warningText('[Warning.DISCONTINUITY] (24.6 m/s):  "Parachute"', t)).toBe(
      'Body diameter discontinuity (24.6 m/s): "Parachute"',
    );
  });

  it('falls back to a readable form of an untranslated key', () => {
    expect(warningText('[Warning.OPEN_AIRFRAME_FORWARD]:  "Body tube"', t)).toBe('Open airframe forward: "Body tube"');
    expect(warningText('[Warning.LargeAOA.str2] (30°)', t)).toBe('Large AOA (30°)');
  });

  it('leaves a message that carries no key alone', () => {
    expect(warningText('Something the kernel said plainly', t)).toBe('Something the kernel said plainly');
  });

  it('reads a component name that is itself an untranslated key', () => {
    expect(warningText('[Warning.DISCONTINUITY] (1 m/s):  "[Parachute.Parachute]"', t)).toBe(
      'Body diameter discontinuity (1 m/s): "Parachute"',
    );
    expect(warningText('[Warning.DISCONTINUITY]:  "[NoseCone.NoseCone]"', t)).toBe(
      'Body diameter discontinuity: "Nose Cone"',
    );
  });

  it('handles a key with no trailing detail', () => {
    expect(warningText('[Warning.DISCONTINUITY]', t)).toBe('Body diameter discontinuity');
  });
});

describe('warningHelp', () => {
  const help = (key: string) => (key === 'warnHelp.RECOVERY_HIGH_SPEED' ? 'The shock can zipper the airframe.' : key);

  it('finds the explanation for a keyed message', () => {
    expect(warningHelp('[Warning.RECOVERY_HIGH_SPEED] (24.6 m/s):  "Parachute"', help)).toBe(
      'The shock can zipper the airframe.',
    );
  });

  it('is null when there is no explanation, rather than echoing the key', () => {
    expect(warningHelp('[Warning.DISCONTINUITY]:  "Nose cone"', help)).toBeNull();
    expect(warningHelp('plain text', help)).toBeNull();
  });
});

describe('warningKeyOf', () => {
  it('reads the key from the MESSAGE, which is the one vocabulary both paths share', () => {
    expect(warningKeyOf('[Warning.RECOVERY_MAIN_LOW_SPEED] (2 m/s)')).toBe('RECOVERY_MAIN_LOW_SPEED');
    expect(warningKeyOf('no key here')).toBeNull();
  });
});

describe('componentName', () => {
  const inEnglish = localeTranslator(en);
  const inSpanish = localeTranslator(es);

  it('names a never-renamed part in the language it is asked for', () => {
    // The kernel has no resource bundles, so its default name arrives as the key.
    expect(componentName('[Parachute.Parachute]', inEnglish)).toBe('Parachute');
    expect(componentName('[Parachute.Parachute]', inSpanish)).toBe(es.part.parachute);
    expect(componentName('[BodyTube.BodyTube]', inEnglish)).toBe(en.part.bodytube);
    expect(componentName('[BodyTube.BodyTube]', inSpanish)).toBe(es.part.bodytube);
    expect(componentName('[EllipticalFinSet.Ellipticalfinset]', inEnglish)).toBe('Elliptical fin set');
  });

  it('degrades to the readable half for a key nothing here names', () => {
    expect(componentName('[Sleeve.Sleeve]', inEnglish)).toBe('Sleeve');
    expect(componentName('[RecoveryDevice.RecoveryDevice]', inEnglish)).toBe('Recovery Device');
  });

  it('returns a name the user typed unchanged', () => {
    for (const name of ['Main chute', 'Drogue', '18" nylon', 'Chute [spare]']) {
      expect(componentName(name, inSpanish)).toBe(name);
    }
  });

  it('points every kernel name at a string that actually exists', () => {
    const missing = Object.entries(COMPONENT_PART_KEYS).filter(([, key]) => inEnglish(key) === key);
    expect(missing).toEqual([]);
  });
});

// TeaVM carries no preferences, so the kernel always prints m/s and degrees.
describe('warningText, in the reader units', () => {
  const format = (q: 'velocity' | 'angle', si: number) =>
    q === 'velocity' ? `${(si / 0.3048).toFixed(1)} ft/s` : `${si.toFixed(3)} rad`;

  it('restates a speed', () => {
    expect(warningText('[Warning.DISCONTINUITY] (24.6 m/s):  "Parachute"', t, format)).toBe(
      'Body diameter discontinuity (80.7 ft/s): "Parachute"',
    );
  });

  it('restates an angle, given in degrees', () => {
    expect(warningText('[Warning.LargeAOA.str2] (30°)', t, format)).toBe('Large AOA (0.524 rad)');
  });

  it('keeps the kernel units when no formatter is given', () => {
    expect(warningText('[Warning.LargeAOA.str2] (30°)', t)).toBe('Large AOA (30°)');
  });
});
