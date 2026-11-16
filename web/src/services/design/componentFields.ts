import type { TFunction } from 'i18next';
import { REQUIRED_COMPONENT_FIELDS } from './requiredComponent';
import { CLUSTER_OPTIONS, clusterCount } from '../../tree/cluster';
import type { DerivedName } from './derivedFields';
import type { IgnitionEvent } from '../../engine/openRocketEngine';
import { KERNEL_DEPLOYMENT, KERNEL_FINISHES } from '../../tree/kernelDefaults';
import { RAIL_BUTTON_BOUNDS, RAIL_BUTTON_FALLBACK, RING_BOUNDS, type DimensionBounds } from './linkedDimensions';
import { num } from '../../tree/nodeProps';
import { shapeOptions } from '../../tree/shapeProfile';

export type PanelSection =
  'placement' | 'finTab' | 'motor' | 'fillet' | 'shoulder' | 'foreShoulder' | 'aftShoulder' | 'material' | 'comment';

type FieldFlags = {
  /** A zero here is unflyable; it does not mean the box can be empty. */
  required?: true;
  section?: PanelSection;
  /** Stored as a radius but edited as a diameter. Per field: a fillet radius really is a radius. */
  diameter?: true;
  auto?: { flag: string; tip: 'autoShoulder' | 'autoRadius' | 'autoComputed' };
  /** May be negative, bounded both ways by the part's axial length. */
  signedWithinLength?: true;
  signed?: true;
  /** In node units. */
  bounds?: DimensionBounds;
  whenAbsent?: number;
};

export type Field = FieldFlags &
  (
    | { key: string; label: string; kind: 'length' } // stored m, shown in units.length
    // Not a node key: read from outer radius and wall; typing one writes the wall.
    | { key: string; label: string; kind: 'bore' }
    // `key` names the row, not a node key.
    | { key: string; label: string; kind: 'derived'; derived: DerivedName; step?: number }
    | { key: string; label: string; kind: 'mass' } // stored kg, shown in units.mass
    | { key: string; label: string; kind: 'count' }
    | { key: string; label: string; kind: 'distance'; step?: number } // stored m, shown in units.distance
    | { key: string; label: string; kind: 'number'; step?: number; unitKey?: string }
    | { key: string; label: string; kind: 'angle'; step?: number } // stored radians, shown in units.angle
    | { key: string; label: string; kind: 'bool' }
    | { key: string; label: string; kind: 'text' }
    | {
        key: string;
        label: string;
        kind: 'select';
        options: string[];
        optI18n?: string;
        fallback?: string;
        optLabel?: (option: string, t: TFunction) => string;
      }
  );

// Kernel spelling; the .ork drops underscores, mapped by the reader and writer. Apogee first: the default.
export const DEPLOY_EVENTS = ['apogee', 'ejection', 'altitude', 'launch', 'lower_stage_separation', 'never'];

export const MASS_COMPONENT_TYPES = [
  'masscomponent',
  'altimeter',
  'flightcomputer',
  'deploymentcharge',
  'tracker',
  'payload',
  'recoveryhardware',
  'battery',
];

// Ejection first: the desktop default.
export const SEPARATION_EVENTS = [
  'ejection',
  'burnout',
  'launch',
  'ignition',
  'upperignition',
  'apogee',
  'altitudeascending',
  'altitudedescending',
  'never',
];

const FIN_TABS: Field[] = [
  { key: 'tabLength', label: 'tabLength', kind: 'length', section: 'finTab' },
  { key: 'tabHeight', label: 'tabHeight', kind: 'length', section: 'finTab' },
  { key: 'tabOffset', label: 'tabOffset', kind: 'length', section: 'finTab', signedWithinLength: true },
  {
    key: 'tabOffsetMethod',
    label: 'tabOffsetMethod',
    kind: 'select',
    options: ['top', 'middle', 'bottom'],
    fallback: 'middle',
    optI18n: 'tabOffsetMethod',
    section: 'finTab',
  },
];

// Tube fins have none: a TubeFinSet is a Tube, not a FinSet.
const FIN_FILLET: Field = { key: 'filletRadius', label: 'filletRadius', kind: 'length', section: 'fillet' };

const COMMENT: Field = { key: 'comment', label: 'comment', kind: 'text', section: 'comment' };

const FIN_CROSS_SECTION: Field = {
  key: 'crossSection',
  label: 'crossSection',
  kind: 'select',
  options: ['square', 'rounded', 'airfoil'],
  optI18n: 'crossSection',
};

const FINISH: Field = {
  key: 'finish',
  label: 'finish',
  kind: 'select',
  options: [...KERNEL_FINISHES],
  optI18n: 'finish',
  fallback: 'normal',
  section: 'material',
};

const RADIAL_PLACEMENT: Field[] = [
  { key: 'radialPosition', label: 'radialPosition', kind: 'length', section: 'placement' },
  { key: 'radialDirection', label: 'radialDirection', kind: 'angle', step: 15, section: 'placement' },
];

const LINE_INSTANCES: Field[] = [
  { key: 'instanceCount', label: 'instanceCount', kind: 'count', section: 'placement' },
  { key: 'instanceSeparation', label: 'instanceSeparation', kind: 'length', section: 'placement' },
];

const PACKED: Field[] = [
  { key: 'length', label: 'packedLength', kind: 'length' },
  {
    key: 'radius',
    label: 'packedDiameter',
    kind: 'length',
    diameter: true,
    auto: { flag: 'radiusAuto', tip: 'autoRadius' },
  },
];

// Straight tubes only: a cone has no single bore, and a ring stores its `innerRadius`.
const TUBE_BORE: Field = { key: 'innerDiameter', label: 'innerDiameter', kind: 'bore' };

const railButtonLength = (key: keyof typeof RAIL_BUTTON_FALLBACK): Field => ({
  key,
  label: key,
  kind: 'length',
  whenAbsent: RAIL_BUTTON_FALLBACK[key],
  ...(RAIL_BUTTON_BOUNDS[key] ? { bounds: RAIL_BUTTON_BOUNDS[key] } : {}),
});

const LENGTH: Field = { key: 'length', label: 'length', kind: 'length' };
const WALL: Field = { key: 'thickness', label: 'thickness', kind: 'length' };

const atMostRadius = (...keys: string[]): DimensionBounds => ({
  max: (n) => Math.max(...keys.map((k) => num(n, k, Infinity))),
});

const TUBE_WALL_THICKNESS: Field = { ...WALL, bounds: atMostRadius('outerRadius') };

const FILLED: Field = { key: 'filled', label: 'filled', kind: 'bool' };

const OUTER_DIAMETER: Field = {
  key: 'outerRadius',
  label: 'diameter',
  kind: 'length',
  diameter: true,
  auto: { flag: 'outerRadiusAuto', tip: 'autoRadius' },
};

const TUBE_WALL: Field[] = [LENGTH, OUTER_DIAMETER, TUBE_BORE, TUBE_WALL_THICKNESS];

export const IGNITION_EVENTS: IgnitionEvent[] = ['automatic', 'launch', 'ejectioncharge', 'burnout', 'never'];

// The mount's ignition flies nothing itself: motors still on it follow it (`followMountIgnition`).
const MOTOR_MOUNT: Field[] = [
  { key: 'motorMount', label: 'motorMount', kind: 'bool', section: 'motor' },
  { key: 'motorOverhang', label: 'motorOverhang', kind: 'length', section: 'motor', signed: true },
  {
    key: 'ignitionEvent',
    label: 'ignitionEvent',
    kind: 'select',
    options: IGNITION_EVENTS,
    optI18n: 'ignition',
    section: 'motor',
  },
  {
    key: 'ignitionDelay',
    label: 'ignitionDelay',
    kind: 'number',
    unitKey: 'units.second',
    step: 0.5,
    section: 'motor',
  },
];

const FIN_ROTATION: Field = { key: 'rotation', label: 'rotation', kind: 'angle', step: 5, section: 'placement' };

const PLANAR_FIN: Field[] = [
  WALL,
  { key: 'cant', label: 'cant', kind: 'angle', step: 0.5 },
  FIN_CROSS_SECTION,
  FIN_ROTATION,
  FIN_FILLET,
  ...FIN_TABS,
];

// radiusMethod 'relative' measures from the parent surface, 'free' from its centerline.
const ASSEMBLY_FIELDS: Field[] = [
  { key: 'instanceCount', label: 'instanceCount', kind: 'count' },
  { key: 'radiusOffset', label: 'radialDistance', kind: 'length' },
  {
    key: 'radiusMethod',
    label: 'radialReference',
    kind: 'select',
    options: ['relative', 'free'],
    optI18n: 'radiusMethod',
  },
  { key: 'angleOffset', label: 'rotation', kind: 'angle', section: 'placement' },
];

const SEPARATION_FIELDS: Field[] = [
  {
    key: 'separationEvent',
    label: 'separationEvent',
    kind: 'select',
    options: SEPARATION_EVENTS,
    optI18n: 'separationEvent',
  },
  { key: 'separationDelay', label: 'separationDelay', kind: 'number', unitKey: 'units.second', step: 0.5 },
  { key: 'separationAltitude', label: 'separationAltitude', kind: 'distance', step: 10 },
];

const DEPLOY_FIELDS: Field[] = [
  {
    key: 'deployEvent',
    label: 'deployEvent',
    kind: 'select',
    options: DEPLOY_EVENTS,
    optI18n: 'deployEvent',
    fallback: KERNEL_DEPLOYMENT.deployEvent,
  },
  { key: 'deployAltitude', label: 'deployAltitude', kind: 'distance', step: 10 },
  { key: 'deployDelay', label: 'deployDelay', kind: 'number', unitKey: 'units.second', step: 0.5 },
];

/** No FIELDS entry may reuse one of these unit-scope keys. */
export const PANEL_SCOPE_KEYS = ['overrideMass', 'overrideCGX', 'offset'] as const;

// Unit scopes are built from (type, key), so a duplicated key would silently share one unit choice.
const RAW_FIELDS: Record<string, Field[]> = {
  stage: SEPARATION_FIELDS,
  nosecone: [
    { key: 'shape', label: 'shape', kind: 'select', options: shapeOptions('nosecone'), optI18n: 'noseShape' },
    { key: 'shapeParameter', label: 'shapeParameter', kind: 'number', step: 0.05 },
    { key: 'length', label: 'length', kind: 'length' },
    {
      key: 'aftRadius',
      label: 'diameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'aftRadiusAuto', tip: 'autoRadius' },
    },
    FILLED,
    { ...WALL, bounds: atMostRadius('aftRadius') },
    { key: 'flipped', label: 'flipped', kind: 'bool' },
    { key: 'shoulderLength', label: 'shoulderLength', kind: 'length', section: 'shoulder' },
    {
      key: 'shoulderRadius',
      label: 'shoulderDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'shoulderAuto', tip: 'autoShoulder' },
      bounds: atMostRadius('aftRadius'),
      section: 'shoulder',
    },
    { key: 'shoulderThickness', label: 'shoulderThickness', kind: 'length', section: 'shoulder' },
    { key: 'shoulderCapped', label: 'shoulderCapped', kind: 'bool', section: 'shoulder' },
    FINISH,
  ],
  bodytube: [LENGTH, OUTER_DIAMETER, TUBE_BORE, FILLED, TUBE_WALL_THICKNESS, ...MOTOR_MOUNT, FINISH],
  transition: [
    {
      key: 'shape',
      label: 'shape',
      kind: 'select',
      options: shapeOptions('transition'),
      optI18n: 'noseShape',
    },
    { key: 'shapeParameter', label: 'shapeParameter', kind: 'number', step: 0.05 },
    { key: 'length', label: 'length', kind: 'length' },
    {
      key: 'foreRadius',
      label: 'foreDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'foreRadiusAuto', tip: 'autoRadius' },
    },
    {
      key: 'aftRadius',
      label: 'aftDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'aftRadiusAuto', tip: 'autoRadius' },
    },
    FILLED,
    { ...WALL, bounds: atMostRadius('foreRadius', 'aftRadius') },
    { key: 'clipped', label: 'clipped', kind: 'bool' },
    { key: 'foreShoulderLength', label: 'foreShoulderLength', kind: 'length', section: 'foreShoulder' },
    {
      key: 'foreShoulderRadius',
      label: 'foreShoulderDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'foreShoulderAuto', tip: 'autoShoulder' },
      bounds: atMostRadius('foreRadius'),
      section: 'foreShoulder',
    },
    { key: 'foreShoulderThickness', label: 'foreShoulderThickness', kind: 'length', section: 'foreShoulder' },
    { key: 'foreShoulderCapped', label: 'foreShoulderCapped', kind: 'bool', section: 'foreShoulder' },
    { key: 'aftShoulderLength', label: 'aftShoulderLength', kind: 'length', section: 'aftShoulder' },
    {
      key: 'aftShoulderRadius',
      label: 'aftShoulderDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'aftShoulderAuto', tip: 'autoShoulder' },
      bounds: atMostRadius('aftRadius'),
      section: 'aftShoulder',
    },
    { key: 'aftShoulderThickness', label: 'aftShoulderThickness', kind: 'length', section: 'aftShoulder' },
    { key: 'aftShoulderCapped', label: 'aftShoulderCapped', kind: 'bool', section: 'aftShoulder' },
    FINISH,
  ],
  trapezoidfinset: [
    { key: 'finCount', label: 'finCount', kind: 'count' },
    { key: 'rootChord', label: 'rootChord', kind: 'length' },
    { key: 'tipChord', label: 'tipChord', kind: 'length' },
    { key: 'sweep', label: 'sweep', kind: 'length', signed: true },
    { key: 'sweepAngle', label: 'sweepAngle', kind: 'derived', derived: 'sweepAngle', step: 5 },
    { key: 'height', label: 'height', kind: 'length' },
    ...PLANAR_FIN,
    FINISH,
  ],
  ellipticalfinset: [
    { key: 'finCount', label: 'finCount', kind: 'count' },
    { key: 'rootChord', label: 'rootChord', kind: 'length' },
    { key: 'height', label: 'height', kind: 'length' },
    ...PLANAR_FIN,
    FINISH,
  ],
  freeformfinset: [{ key: 'finCount', label: 'finCount', kind: 'count' }, ...PLANAR_FIN, FINISH],
  tubefinset: [
    { key: 'finCount', label: 'tubeCount', kind: 'count' },
    { key: 'length', label: 'length', kind: 'length' },
    {
      key: 'outerRadius',
      label: 'tubeDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'outerRadiusAuto', tip: 'autoRadius' },
    },
    TUBE_BORE,
    TUBE_WALL_THICKNESS,
    FIN_ROTATION,
    FINISH,
  ],
  innertube: [
    LENGTH,
    { key: 'outerRadius', label: 'diameter', kind: 'length', diameter: true },
    TUBE_BORE,
    TUBE_WALL_THICKNESS,
    ...MOTOR_MOUNT,
    {
      key: 'cluster',
      label: 'cluster',
      kind: 'select',
      options: CLUSTER_OPTIONS,
      optLabel: (o, t) =>
        o === 'single' ? t('cluster.single') : t('cluster.pattern', { name: o, n: clusterCount(o) }),
      section: 'motor',
    },
    // A multiple of the tube diameter.
    { key: 'clusterScale', label: 'clusterScale', kind: 'number', step: 0.1, section: 'motor', whenAbsent: 1 },
    {
      key: 'clusterSeparation',
      label: 'clusterSeparation',
      kind: 'derived',
      derived: 'clusterSeparation',
      section: 'motor',
    },
    { key: 'clusterRotation', label: 'clusterRotation', kind: 'angle', step: 15, section: 'motor' },
    ...RADIAL_PLACEMENT,
  ],
  tubecoupler: [...TUBE_WALL, ...RADIAL_PLACEMENT],
  centeringring: [
    { key: 'length', label: 'thickness', kind: 'length' },
    {
      key: 'outerRadius',
      label: 'outerDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'outerRadiusAuto', tip: 'autoRadius' },
      bounds: RING_BOUNDS.outerRadius,
    },
    {
      key: 'innerRadius',
      label: 'innerDiameter',
      kind: 'length',
      diameter: true,
      auto: { flag: 'innerRadiusAuto', tip: 'autoRadius' },
      bounds: RING_BOUNDS.innerRadius,
    },
    ...LINE_INSTANCES,
    ...RADIAL_PLACEMENT,
  ],
  bulkhead: [
    { key: 'length', label: 'thickness', kind: 'length' },
    OUTER_DIAMETER,
    ...LINE_INSTANCES,
    ...RADIAL_PLACEMENT,
  ],
  engineblock: [...TUBE_WALL, ...RADIAL_PLACEMENT],
  launchlug: [
    { key: 'length', label: 'length', kind: 'length' },
    { key: 'outerRadius', label: 'diameter', kind: 'length', diameter: true },
    TUBE_BORE,
    TUBE_WALL_THICKNESS,
    { key: 'angleOffset', label: 'rotation', kind: 'angle', section: 'placement' },
    ...LINE_INSTANCES,
    FINISH,
  ],
  railbutton: [
    railButtonLength('outerDiameter'),
    railButtonLength('innerDiameter'),
    railButtonLength('height'),
    railButtonLength('baseHeight'),
    railButtonLength('flangeHeight'),
    railButtonLength('screwHeight'),
    { key: 'angleOffset', label: 'rotation', kind: 'angle', section: 'placement' },
    ...LINE_INSTANCES,
    FINISH,
  ],
  parachute: [
    { key: 'diameter', label: 'diameter', kind: 'length' },
    { key: 'cd', label: 'dragCoeff', kind: 'number', step: 0.05, auto: { flag: 'cdAuto', tip: 'autoComputed' } },
    { key: 'lineCount', label: 'lineCount', kind: 'count' },
    { key: 'lineLength', label: 'lineLength', kind: 'length', auto: { flag: 'lineLengthAuto', tip: 'autoComputed' } },
    ...DEPLOY_FIELDS,
    ...PACKED,
    ...RADIAL_PLACEMENT,
  ],
  streamer: [
    { key: 'stripLength', label: 'length', kind: 'length' },
    { key: 'stripWidth', label: 'width', kind: 'length' },
    { key: 'stripArea', label: 'stripArea', kind: 'derived', derived: 'stripArea' },
    { key: 'stripAspect', label: 'stripAspect', kind: 'derived', derived: 'stripAspect', step: 0.5 },
    { key: 'cd', label: 'dragCoeff', kind: 'number', step: 0.05, auto: { flag: 'cdAuto', tip: 'autoComputed' } },
    ...DEPLOY_FIELDS,
    ...PACKED,
    ...RADIAL_PLACEMENT,
  ],
  masscomponent: [
    { key: 'mass', label: 'mass', kind: 'mass' },
    // Divides by the packed volume, not the part's own.
    { key: 'massDensity', label: 'massDensity', kind: 'derived', derived: 'massDensity' },
    {
      key: 'massComponentType',
      label: 'massComponentType',
      kind: 'select',
      options: MASS_COMPONENT_TYPES,
      optI18n: 'massComponentType',
    },
    ...PACKED,
    ...RADIAL_PLACEMENT,
  ],
  shockcord: [
    { key: 'cordLength', label: 'cordLength', kind: 'length', auto: { flag: 'cordLengthAuto', tip: 'autoComputed' } },
    ...PACKED,
    ...RADIAL_PLACEMENT,
  ],
  podset: ASSEMBLY_FIELDS,
  parallelstage: [...ASSEMBLY_FIELDS, ...SEPARATION_FIELDS],
};

export const FIELDS: Record<string, Field[]> = Object.fromEntries(
  Object.entries(RAW_FIELDS).map(([type, fields]) => [
    type,
    [...fields, COMMENT].map((f) =>
      (REQUIRED_COMPONENT_FIELDS[type] ?? []).includes(f.key) ? { ...f, required: true } : f,
    ),
  ]),
);
