import { degToRad } from '../../prefs/units';

/** TeaVM has no resource bundles, so warnings arrive as `[Warning.KEY] (value):  "Source"`. */
const KEY = /^\[Warning\.([A-Za-z0-9_.]+)\]\s*/;

/** An unrenamed component's default name is also an untranslated key: `"[Parachute.Parachute]"`. */
const SOURCE_KEY = /\[([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\]/g;
/** Built from `.source`: a pattern string would need double-escaped backslashes. */
const WHOLE_SOURCE_KEY = new RegExp(`^${SOURCE_KEY.source}$`);

export function isDefaultComponentName(raw: string): boolean {
  return WHOLE_SOURCE_KEY.test(raw);
}

/**
 * From the `getComponentName()` overrides in core/rocketcomponent/*.java; spelled out, not
 * derived by lowercasing, since the halves do not always agree (`Ellipticalfinset`).
 */
export const COMPONENT_PART_KEYS: Record<string, string> = {
  'BodyTube.BodyTube': 'part.bodytube',
  'BoosterSet.BoosterSet': 'part.parallelstage',
  'Bulkhead.Bulkhead': 'part.bulkhead',
  'CenteringRing.CenteringRing': 'part.centeringring',
  'EllipticalFinSet.Ellipticalfinset': 'part.ellipticalfinset',
  'EngineBlock.EngineBlock': 'part.engineblock',
  'FreeformFinSet.FreeformFinSet': 'part.freeformfinset',
  'InnerTube.InnerTube': 'part.innertube',
  'LaunchLug.Launchlug': 'part.launchlug',
  'MassComponent.MassComponent': 'part.masscomponent',
  'NoseCone.NoseCone': 'part.nosecone',
  'Parachute.Parachute': 'part.parachute',
  'PodSet.PodSet': 'part.podset',
  'RailButton.RailButton': 'part.railbutton',
  'ShockCord.ShockCord': 'part.shockcord',
  'Stage.Stage': 'part.stage',
  'Streamer.Streamer': 'part.streamer',
  'Transition.Transition': 'part.transition',
  'TrapezoidFinSet.TrapezoidFinSet': 'part.trapezoidfinset',
  'TubeCoupler.TubeCoupler': 'part.tubecoupler',
  'TubeFinSet.TubeFinSet': 'part.tubefinset',
};

/** A blank name becomes the bracketed default key, as `RocketComponent.setName` does. */
export function kernelComponentName(node: { type: string; name?: unknown }): string {
  if (typeof node.name === 'string' && node.name.trim() !== '') return node.name;
  const part = `part.${node.type}`;
  const key = Object.keys(COMPONENT_PART_KEYS).find((k) => COMPONENT_PART_KEYS[k] === part);
  return key ? `[${key}]` : '';
}

/** `translate` is a parameter because the flight-path export can use another language. */
export function componentName(raw: string, translate: (key: string) => string | undefined): string {
  return raw.replace(SOURCE_KEY, (_all, ns: string, name: string) => {
    const key = COMPONENT_PART_KEYS[`${ns}.${name}`];
    const translated = key ? translate(key) : undefined;
    return translated && translated !== key ? translated : humanize(name);
  });
}

function humanize(key: string): string {
  const base = key.split('.')[0] ?? key;
  if (base.includes('_')) {
    const words = base.toLowerCase().split('_').filter(Boolean);
    const first = words[0] ?? base;
    return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ');
  }
  return base.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Not `EngineWarning.key`: the bridge renames some warnings and design warnings have none. */
export function warningKeyOf(message: string): string | null {
  return KEY.exec(message)?.[1] ?? null;
}

export function warningHelp(message: string, translate: (key: string) => string | undefined): string | null {
  const key = warningKeyOf(message);
  if (!key) return null;
  const lookup = `warnHelp.${key}`;
  const help = translate(lookup);
  return help && help !== lookup ? help : null;
}

export type WarningValueFormat = (quantity: 'velocity' | 'angle', si: number) => string;

/** TeaVM has no preferences, so the kernel prints default units: "(24.6 m/s)", "(30°)" in degrees. */
const KERNEL_SPEED = /\((-?\d+(?:\.\d+)?) m\/s\)/g;
const KERNEL_ANGLE = /\((-?\d+(?:\.\d+)?)°\)/g;

function inReaderUnits(text: string, format: WarningValueFormat | undefined): string {
  if (!format) return text;
  return text
    .replace(KERNEL_SPEED, (_m, v: string) => `(${format('velocity', Number(v))})`)
    .replace(KERNEL_ANGLE, (_m, v: string) => `(${format('angle', degToRad(Number(v)))})`);
}

/** `translate` returns undefined or the key itself when it has no string. */
export function warningText(
  message: string,
  translate: (key: string) => string | undefined,
  format?: WarningValueFormat,
): string {
  const m = KEY.exec(message);
  if (!m) return message;
  const key = m[1]!;
  const lookup = `warn.${key}`;
  const translated = translate(lookup);
  const head = translated && translated !== lookup ? translated : humanize(key);
  // The kernel separates sources with ":  " (two spaces), after any value.
  const rest = inReaderUnits(
    componentName(message.slice(m[0].length).trim().replace(/:\s+/g, ': '), translate),
    format,
  );
  if (!rest) return head;
  return rest.startsWith(':') ? `${head}${rest}` : `${head} ${rest}`;
}
