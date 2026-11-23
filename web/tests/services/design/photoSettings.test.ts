import { describe, expect, it } from 'vitest';
import {
  PHOTO_DEFAULTS,
  photoSettingsMap,
  readPhotoSettings,
  reducePi,
  reduce2Pi,
} from '../../../src/services/design/photoSettings';

describe('reading Photo Studio settings as PhotoStudioGetter does', () => {
  it("is desktop's defaults with nothing stored", () => {
    expect(readPhotoSettings(undefined)).toEqual({ ...PHOTO_DEFAULTS, viewAz: 2.08, viewAlt: -0.23 });
  });

  it('reads numbers, flags, colors and the sky', () => {
    const s = readPhotoSettings({
      roll: '0.5',
      yaw: '1.25',
      flame: 'true',
      smoke: 'TRUE',
      sparks: 'yes',
      sunlight: '1 2 3 4',
      sky: 'info.openrocket.swing.gui.figure3d.photo.sky.builtin.Storm',
      backgroundType: 'GRADIENT',
    });
    expect(s).toMatchObject({
      roll: 0.5,
      yaw: 1.25,
      flame: true,
      smoke: true,
      sparks: false,
      sunlight: [1, 2, 3, 4],
      sky: 'Storm',
      backgroundType: 'GRADIENT',
    });
  });

  it('finds a sky by its simple name, as an old net.sf file names it', () => {
    expect(readPhotoSettings({ sky: 'net.sf.openrocket.gui.figure3d.photo.sky.builtin.Lake' }).sky).toBe('Lake');
  });

  it('keeps the default for what it cannot read', () => {
    const s = readPhotoSettings({ roll: 'abc', pitch: 'NaN', sunlight: '1 2 3', skyColor: '1 2 3 300' });
    expect(s.roll).toBe(PHOTO_DEFAULTS.roll);
    expect(s.pitch).toBe(PHOTO_DEFAULTS.pitch);
    expect(s.sunlight).toEqual(PHOTO_DEFAULTS.sunlight);
    expect(s.skyColor).toEqual(PHOTO_DEFAULTS.skyColor);
  });

  it('works out the background of a file from before backgroundType from its sky', () => {
    expect(readPhotoSettings({ sky: 'x.Mountains' }).backgroundType).toBe('TEXTURE');
    expect(readPhotoSettings({ sky: '' }).backgroundType).toBe('SOLID_COLOR');
    expect(readPhotoSettings({ sky: 'x.Unknown' })).toMatchObject({ sky: null, backgroundType: 'SOLID_COLOR' });
  });

  it("applies the setters' limits", () => {
    const s = readPhotoSettings({ viewAz: '7', viewAlt: '4', viewDistance: '-1', lightStrength: '5', fov: '9' });
    expect(s.viewAz).toBeCloseTo(7 - 2 * Math.PI, 12);
    expect(s.viewAlt).toBeCloseTo(4 - 2 * Math.PI, 12);
    expect(s).toMatchObject({ viewDistance: 0, lightStrength: 2, fov: Math.PI });
  });
});

describe('writing them as PhotoStudioSetter does', () => {
  it('writes every setting, whole numbers with their .0, colors as four channels, the sky by class', () => {
    const map = photoSettingsMap({ ...PHOTO_DEFAULTS, yaw: 0, advance: 0.25, sky: 'Meadow' });
    expect(map).toMatchObject({
      yaw: '0.0',
      advance: '0.25',
      flame: 'false',
      smokeColor: '230 230 230 102',
      backgroundType: 'TEXTURE',
      sky: 'info.openrocket.swing.gui.figure3d.photo.sky.builtin.Meadow',
    });
    expect(photoSettingsMap({ ...PHOTO_DEFAULTS, sky: null }).sky).toBe('');
  });

  it('reads back what it writes', () => {
    const s = {
      ...PHOTO_DEFAULTS,
      roll: 1.5,
      flame: true,
      smokeColor: [9, 8, 7, 6] as [number, number, number, number],
    };
    expect(readPhotoSettings(photoSettingsMap(s))).toEqual(
      readPhotoSettings(photoSettingsMap(readPhotoSettings(photoSettingsMap(s)))),
    );
    expect(readPhotoSettings(photoSettingsMap(s))).toMatchObject({ roll: 1.5, flame: true, smokeColor: [9, 8, 7, 6] });
  });

  it('keeps anything else the map held', () => {
    expect(photoSettingsMap(PHOTO_DEFAULTS, { smokeOpacity: '0.4' }).smokeOpacity).toBe('0.4');
  });
});

describe("MathUtil's angle reductions", () => {
  it('bring an angle into [0, 2π) and [-π, π)', () => {
    expect(reduce2Pi(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 12);
    expect(reducePi(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
    expect(reducePi(-0.25)).toBeCloseTo(-0.25, 12);
  });
});
