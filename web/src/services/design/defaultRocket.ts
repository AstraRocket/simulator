// cspell:ignore HDPE -- a catalog material name, matched as written
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { defaultDesignName } from '../app/appInfo';
import { defaultStageName } from './orkTree';
import { defaultMaterialPatch } from './materialSlots';
import { catalogPatch, presetLink } from './treeEdit';
import type { ParachuteComponent } from '../parts/componentDb';

// Rows must match the catalog on disk (`defaultRocketParts.test.ts`); preset densities move mass and CG.

export interface PresetRow {
  partNo: string;
  type: 'nosecone' | 'bodytube' | 'centeringring' | 'parachute';
  /** From `scripts/sync-preset-digests.mjs`; desktop rejects the preset link without it. */
  digest?: string;
  outerDiameter?: number;
  innerDiameter?: number;
  length?: number;
  diameter?: number;
  materialDensity?: number;
  material?: string;
  thickness?: number;
  shoulderDiameter?: number;
  shoulderLength?: number;
  /** kg */
  mass?: number;
  desc?: string;
  cd?: number | null;
  lineCount?: number;
  lineLength?: number;
  lineMaterial?: string;
  lineMaterialDensity?: number;
}

export const DEFAULT_PRESETS = {
  // Not PNC-50K: it is cataloged 0.05 mm narrower than BT-50, and the kernel warns of a discontinuity.
  nose: {
    partNo: 'PNC-50KA',
    type: 'nosecone',
    digest: 'b3b5899ebbb48c4ec80bae00d72280a9',
    outerDiameter: 0.024790399999999997,
    length: 0.06985,
    thickness: 0.0015748,
    shoulderDiameter: 0.02413,
    shoulderLength: 0.0127,
    mass: 0.003685438003,
    materialDensity: 551.5669231021728,
    material: 'Polystyrene, cast, bulk',
  },
  body: {
    partNo: 'BT-50, 30352',
    type: 'bodytube',
    digest: 'a59dec8e4034a2fee5955dbf4ff07f1c',
    outerDiameter: 0.024790399999999997,
    innerDiameter: 0.02413,
    length: 0.4572,
    materialDensity: 894.4,
    material: 'Paper, spiral kraft glassine, Estes avg, bulk',
  },
  mount: {
    partNo: 'BT-20J, 30326, 30332, 30408',
    type: 'bodytube',
    digest: '0f9c942f46291e7b4de035cd1a4cba6b',
    outerDiameter: 0.0186944,
    innerDiameter: 0.018033999999999998,
    length: 0.06985,
    materialDensity: 894.4,
    material: 'Paper, spiral kraft glassine, Estes avg, bulk',
  },
  ring: {
    partNo: 'AR-2050, 3101, 30164',
    digest: '18188426cd6313e89068ace99433a94c',
    type: 'centeringring',
    outerDiameter: 0.0240792,
    innerDiameter: 0.0187452,
    length: 0.00635,
    materialDensity: 657,
    material: 'Fiber, bulk',
  },
  chute: {
    partNo: 'PK-12, 2263',
    type: 'parachute',
    digest: 'e38b3873b4c5e66b9f07aaa094cb1ff8',
    desc: 'Parachute kit, plastic, 12 in., PN 2263',
    diameter: 0.30479999999999996,
    cd: null,
    lineCount: 6,
    lineLength: 0.30479999999999996,
    material: 'Polyethylene film, HDPE, 1.0 mil, bare',
    materialDensity: 0.0235,
    lineMaterial: 'Carpet Thread',
    lineMaterialDensity: 0.00033,
  },
} as const satisfies Record<string, PresetRow>;

const PLANFORM = { root: 0.08, tip: 0.038, sweep: 0.055, span: 0.058 } as const;
const FIN_SCALE = 0.7;

const FIN = {
  rootChord: PLANFORM.root * FIN_SCALE,
  tipChord: PLANFORM.tip * FIN_SCALE,
  sweep: PLANFORM.sweep * FIN_SCALE,
  height: PLANFORM.span * FIN_SCALE,
  thickness: 0.00238125,
  materialName: 'Balsa',
  materialDensity: 170,
  materialGroup: 'Woods',
} as const;

const WADDING_MASS = 0.002;

/** Offsets below the tube's fore end (m). */
const PACK = { chute: 0.03, cord: 0.1, wadding: 0.155 };

// aftOffset: negative is forward; guided travel ends when the aft-most guide leaves the rod.
const LUG = { length: 0.0349, outerRadius: 0.002, thickness: 0.00025, aftOffset: -0.02 };

function fromPreset(row: PresetRow): Record<string, unknown> {
  const link = { preset: presetLink(row.type, 'Estes', row.partNo, row.digest) };
  const mat = row.materialDensity ? { density: row.materialDensity, materialName: row.material } : {};
  return { ...link, ...mat };
}

function tube(row: PresetRow & Required<Pick<PresetRow, 'outerDiameter' | 'innerDiameter'>>): Record<string, unknown> {
  return {
    ...fromPreset(row),
    length: row.length,
    outerRadius: row.outerDiameter / 2,
    thickness: (row.outerDiameter - row.innerDiameter) / 2,
    // Pinned: an automatic radius would be resolved over the part (see pinStated).
    outerRadiusAuto: false,
  };
}

// Unnamed so the tree shows its type.
function chuteNode(): Record<string, unknown> {
  const row = DEFAULT_PRESETS.chute;
  const part: ParachuteComponent = { ...row, mfr: 'Estes' };
  const patch = catalogPatch(part);
  delete patch.name;
  return { ...patch, preset: presetLink(row.type, 'Estes', row.partNo, row.digest) };
}

function ring(id: string, position: { method: string; offset: number }): ComponentNode {
  const row = DEFAULT_PRESETS.ring;
  return {
    type: 'centeringring',
    id,
    ...fromPreset(row),
    length: row.length,
    outerRadius: row.outerDiameter / 2,
    innerRadius: row.innerDiameter / 2,
    outerRadiusAuto: false,
    innerRadiusAuto: false,
    position,
  } as unknown as ComponentNode;
}

/** Built fresh on every call: the store mutates the tree it holds. */
export function defaultRocketTree(): RocketTree {
  const { nose, body, mount } = DEFAULT_PRESETS;

  const noseNode: ComponentNode = {
    type: 'nosecone',
    id: 'nose',
    shape: 'ogive',
    ...fromPreset(nose),
    length: nose.length,
    aftRadius: nose.outerDiameter / 2,
    aftRadiusAuto: false,
    // Uncapped: a molded cone is open at its base.
    thickness: nose.thickness,
    shoulderLength: nose.shoulderLength,
    shoulderRadius: nose.shoulderDiameter / 2,
    shoulderThickness: nose.thickness,
  } as unknown as ComponentNode;

  const bodyNode: ComponentNode = {
    type: 'bodytube',
    id: 'body',
    ...tube(body),
    children: [
      {
        type: 'trapezoidfinset',
        id: 'fins',
        finCount: 3,
        rootChord: FIN.rootChord,
        tipChord: FIN.tipChord,
        sweep: FIN.sweep,
        height: FIN.height,
        thickness: FIN.thickness,
        density: FIN.materialDensity,
        materialName: FIN.materialName,
        materialGroup: FIN.materialGroup,
        position: { method: 'bottom', offset: 0 },
      },
      {
        type: 'innertube',
        id: 'mount',
        motorMount: true,
        ...tube(mount),
        position: { method: 'bottom', offset: 0 },
        motorOverhang: 0.00635,
        children: [
          {
            type: 'engineblock',
            id: 'block',
            length: 0.005,
            outerRadius: mount.innerDiameter / 2,
            outerRadiusAuto: false,
            thickness: 0.003,
            ...defaultMaterialPatch('engineblock', {}),
            position: { method: 'top', offset: 0 },
          },
        ],
      },
      ring('ring-fore', { method: 'top', offset: body.length - mount.length }),
      ring('ring-aft', { method: 'bottom', offset: 0 }),
      {
        type: 'parachute',
        id: 'chute',
        ...chuteNode(),
        // Explicit, so the panel and the kernel (which falls back to ejection) agree.
        deployEvent: 'apogee',
        deployAltitude: 200,
        deployDelay: 0,
        position: { method: 'top', offset: PACK.chute },
      },
      {
        type: 'shockcord',
        id: 'cord',
        cordLength: 0.45,
        length: 0.05,
        radius: 0.006,
        ...defaultMaterialPatch('shockcord', {}),
        position: { method: 'top', offset: PACK.cord },
      },
      {
        type: 'masscomponent',
        id: 'wadding',
        mass: WADDING_MASS,
        length: 0.03,
        radius: body.innerDiameter / 2,
        massComponentType: 'masscomponent',
        position: { method: 'top', offset: PACK.wadding },
      },
      {
        type: 'launchlug',
        id: 'lug',
        length: LUG.length,
        outerRadius: LUG.outerRadius,
        thickness: LUG.thickness,
        ...defaultMaterialPatch('launchlug', {}),
        position: { method: 'bottom', offset: LUG.aftOffset },
      },
    ],
  } as unknown as ComponentNode;

  return {
    name: defaultDesignName(),
    components: [{ type: 'stage', name: defaultStageName(0), id: 's1', children: [noseNode, bodyNode] }],
  } as unknown as RocketTree;
}
