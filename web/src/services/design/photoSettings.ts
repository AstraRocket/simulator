// Desktop's Photo Studio settings. The file and the tree keep them as desktop's core does, a map of element name to
// text (`PhotoStudioHandler`), so a file's values come back out exactly as they went in; this module reads that map
// as `PhotoStudioGetter` does and writes it as `PhotoStudioSetter` does.

export const BACKGROUND_TYPES = ['SOLID_COLOR', 'GRADIENT', 'TEXTURE'] as const;
export type BackgroundType = (typeof BACKGROUND_TYPES)[number];

/** Desktop's built-in skies, in its list's order, with the credit its panel shows. */
export const SKIES = [
  { id: 'Mountains', name: 'Mountains', credit: 'Rendering by Bill Kuker. CC0 Public Domain.' },
  { id: 'Meadow', name: 'Meadow', credit: '© Emil Persson, aka Humus. CC-BY 3.0 Attribution License.' },
  { id: 'Storm', name: 'Stormy Days', credit: '© Jockum Skoglund aka hipshot. CC-BY 3.0 Attribution License.' },
  { id: 'Lake', name: 'Frozen Lake', credit: 'Sampo Niskanen.' },
  { id: 'Orbit', name: 'Orbit', credit: 'NASA' },
  { id: 'Miramar', name: 'Miramar', credit: '© Jockum Skoglund aka hipshot. CC-BY 3.0 Attribution License.' },
] as const;
export type SkyId = (typeof SKIES)[number]['id'];

/** The class desktop writes in `<sky>`; it reads any package by the simple name. */
const SKY_CLASS = 'info.openrocket.swing.gui.figure3d.photo.sky.builtin.';

/** 0-255 each. */
export type Rgba = [number, number, number, number];

export interface PhotoSettings {
  /** Radians, the rocket's pose. */
  roll: number;
  yaw: number;
  pitch: number;
  /** Meters along the rocket from its middle. */
  advance: number;
  /** Radians and meters, the camera about the rocket's middle. */
  viewAlt: number;
  viewAz: number;
  viewDistance: number;
  fov: number;
  lightAlt: number;
  lightAz: number;
  /** 0-2. */
  lightStrength: number;
  sunlight: Rgba;
  /** 0-1. */
  ambiance: number;
  backgroundType: BackgroundType;
  /** Its alpha is the background's opacity. */
  skyColor: Rgba;
  gradientTopColor: Rgba;
  gradientBottomColor: Rgba;
  /** Null shows the sky color, as desktop does for a sky it cannot load. */
  sky: SkyId | null;
  motionBlurred: boolean;
  /** 0-20. */
  motionBlurAmount: number;
  flame: boolean;
  flameColor: Rgba;
  smoke: boolean;
  /** Its alpha is the smoke's opacity. */
  smokeColor: Rgba;
  sparks: boolean;
  /** 1 is 100%. */
  exhaustScale: number;
  flameAspectRatio: number;
  /** 0-1. */
  sparkConcentration: number;
  sparkWeight: number;
}

/** Desktop `PhotoSettings`'s field defaults. */
export const PHOTO_DEFAULTS: PhotoSettings = {
  roll: 3.14,
  yaw: 0,
  pitch: 2.05,
  advance: 0,
  viewAlt: -0.23,
  viewAz: 2.08,
  viewDistance: 0.8,
  fov: (50 * Math.PI) / 180,
  lightAlt: 0.35,
  lightAz: -1,
  lightStrength: 0.8,
  sunlight: [255, 255, 255, 255],
  ambiance: 0.1,
  backgroundType: 'TEXTURE',
  skyColor: [55, 95, 155, 255],
  gradientTopColor: [81, 126, 193, 255],
  gradientBottomColor: [32, 42, 58, 255],
  sky: 'Mountains',
  motionBlurred: false,
  motionBlurAmount: 5,
  flame: false,
  flameColor: [255, 100, 50, 255],
  smoke: false,
  smokeColor: [230, 230, 230, 102],
  sparks: false,
  exhaustScale: 1,
  flameAspectRatio: 1,
  sparkConcentration: 0.5,
  sparkWeight: 0,
};

const TWO_PI = 2 * Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** `MathUtil.reduce2Pi`: into [0, 2π). */
export const reduce2Pi = (a: number): number => ((a % TWO_PI) + TWO_PI) % TWO_PI;
/** `MathUtil.reducePi`: into [-π, π). */
export const reducePi = (a: number): number => reduce2Pi(a + Math.PI) - Math.PI;

/** The setters' limits, as each `PhotoSettings.set*` applies them. */
export function settled(s: PhotoSettings): PhotoSettings {
  return {
    ...s,
    viewAz: reduce2Pi(s.viewAz),
    viewAlt: reducePi(s.viewAlt),
    viewDistance: Math.max(0, s.viewDistance),
    fov: clamp(s.fov, 0, Math.PI),
    lightStrength: clamp(s.lightStrength, 0, 2),
    motionBlurAmount: clamp(s.motionBlurAmount, 0, 20),
  };
}

const NUMBER_KEYS = [
  'roll',
  'yaw',
  'pitch',
  'advance',
  'viewAlt',
  'viewAz',
  'viewDistance',
  'fov',
  'lightAlt',
  'lightAz',
  'lightStrength',
  'ambiance',
  'motionBlurAmount',
  'exhaustScale',
  'flameAspectRatio',
  'sparkConcentration',
  'sparkWeight',
] as const;
const BOOLEAN_KEYS = ['motionBlurred', 'flame', 'smoke', 'sparks'] as const;
const COLOR_KEYS = [
  'sunlight',
  'skyColor',
  'gradientTopColor',
  'gradientBottomColor',
  'flameColor',
  'smokeColor',
] as const;

/** The elements `PhotoStudioHandler` reads as text; the colors it reads from attributes. */
export const PHOTO_TEXT_ELEMENTS: ReadonlySet<string> = new Set<string>([
  ...NUMBER_KEYS,
  ...BOOLEAN_KEYS,
  'smokeOpacity',
  'sky',
  'backgroundType',
]);
export const PHOTO_COLOR_ELEMENTS: ReadonlySet<string> = new Set<string>(COLOR_KEYS);

/** `Double.parseDouble`, finite only, as `PhotoStudioGetter.parseDouble` takes it. */
function javaDouble(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(t)) return undefined;
  const v = Number(t.replace(/[dDfF]$/, ''));
  return Number.isFinite(v) ? v : undefined;
}

/** `PhotoStudioGetter.getColor`: four channels, each 0-255. */
function colorOf(raw: string | undefined): Rgba | undefined {
  const parts = raw?.trim().split(/\s+/);
  if (!parts || parts.length !== 4 || !parts.every((p) => /^[+-]?\d+$/.test(p))) return undefined;
  const c = parts.map(Number);
  return c.every((v) => v >= 0 && v <= 255) ? (c as Rgba) : undefined;
}

const skyOf = (raw: string): SkyId | null => {
  const simple = raw.slice(raw.lastIndexOf('.') + 1);
  return SKIES.find((s) => s.id === simple)?.id ?? null;
};

/** `PhotoStudioGetter.getPhotoSettings`: what is unreadable keeps the default. */
export function readPhotoSettings(map: Readonly<Record<string, string>> | undefined): PhotoSettings {
  const s: PhotoSettings = { ...PHOTO_DEFAULTS };
  if (!map) return s;
  const get = (k: string) => (Object.hasOwn(map, k) ? map[k] : undefined);
  for (const k of NUMBER_KEYS) {
    const v = javaDouble(get(k));
    if (v !== undefined) s[k] = v;
  }
  // `Boolean.parseBoolean`: anything but "true" is false.
  for (const k of BOOLEAN_KEYS) {
    const v = get(k);
    if (v !== undefined) s[k] = v.toLowerCase() === 'true';
  }
  for (const k of COLOR_KEYS) {
    const c = colorOf(get(k));
    if (c) s[k] = c;
  }
  const sky = get('sky');
  if (sky !== undefined) s.sky = sky === '' ? null : skyOf(sky);
  const bg = get('backgroundType');
  if ((BACKGROUND_TYPES as readonly string[]).includes(bg ?? '')) s.backgroundType = bg as BackgroundType;
  // A file from before backgroundType names only the sky.
  else s.backgroundType = s.sky !== null ? 'TEXTURE' : 'SOLID_COLOR';
  return settled(s);
}

/** Java's `String.valueOf(double)` for what the app writes: whole numbers keep their `.0`. */
const javaText = (v: number): string => (Number.isInteger(v) ? `${v}.0` : String(v));

/** `PhotoStudioSetter.getPhotoSettings`, over the map it came from so nothing else in it is lost. */
export function photoSettingsMap(
  s: PhotoSettings,
  from: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const out: Record<string, string> = { ...from };
  for (const k of NUMBER_KEYS) out[k] = javaText(s[k]);
  for (const k of BOOLEAN_KEYS) out[k] = String(s[k]);
  for (const k of COLOR_KEYS) out[k] = s[k].join(' ');
  out['backgroundType'] = s.backgroundType;
  out['sky'] = s.sky ? SKY_CLASS + s.sky : '';
  return out;
}

/** `PhotoStudioSaver.getElements`' order. */
export const PHOTO_ELEMENT_ORDER = [
  'roll',
  'yaw',
  'pitch',
  'advance',
  'viewAlt',
  'viewAz',
  'viewDistance',
  'fov',
  'lightAlt',
  'lightAz',
  'lightStrength',
  'sunlight',
  'ambiance',
  'skyColor',
  'backgroundType',
  'gradientTopColor',
  'gradientBottomColor',
  'motionBlurred',
  'motionBlurAmount',
  'flame',
  'flameColor',
  'smoke',
  'smokeColor',
  'sparks',
  'exhaustScale',
  'flameAspectRatio',
  'sparkConcentration',
  'sparkWeight',
  'sky',
] as const;

/** `#rrggbb` of a color, for a color input. */
export const rgbaHex = (c: Rgba): string =>
  `#${c
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
