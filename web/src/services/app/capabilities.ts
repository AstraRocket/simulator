// Gate mobile features here by name; do not test the device anywhere else.

export type DeviceClass = 'desktop' | 'mobile';

export interface CapabilityRule {
  readonly availableOn: readonly DeviceClass[];
  readonly why: string;
}

const DESKTOP: readonly DeviceClass[] = ['desktop'];
const EVERYWHERE: readonly DeviceClass[] = ['desktop', 'mobile'];

export const CAPABILITIES = {
  'import:rocksim': {
    availableOn: DESKTOP,
    why: 'RockSim runs only on a desktop computer, so its files come from one. A .rkt handed to the .ork picker is refused too.',
  },
  'export:rocksim': { availableOn: DESKTOP, why: 'RockSim runs only on a desktop computer.' },
  'export:rasaero': { availableOn: DESKTOP, why: 'RASAero II is a Windows program.' },
  'export:print3mf': { availableOn: DESKTOP, why: 'The whole-rocket 3MF is for a slicer, a desktop program.' },
  'export:onshapeJson': { availableOn: DESKTOP, why: "The JSON is read by Onshape's import feature on a desktop." },
  'export:part:stl': { availableOn: DESKTOP, why: 'For a slicer or CAD program, both desktop programs.' },
  'export:part:obj': { availableOn: DESKTOP, why: 'For a slicer or CAD program, both desktop programs.' },
  'export:part:3mf': { availableOn: DESKTOP, why: 'For a slicer, a desktop program.' },
  'export:part:dxf': { availableOn: DESKTOP, why: 'For laser cutter or CNC software, desktop programs.' },
  'export:part:glb': { availableOn: EVERYWHERE, why: 'Phones and tablets view a GLB in 3D.' },
} as const satisfies Record<string, CapabilityRule>;

export type Capability = keyof typeof CAPABILITIES;

export const capabilityAllowed = (cap: Capability, device: DeviceClass): boolean =>
  CAPABILITIES[cap].availableOn.includes(device);
