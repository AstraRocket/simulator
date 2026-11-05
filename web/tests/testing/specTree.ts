import type { ComponentNode, NoseShape, RocketTree } from '../../src/engine/openRocketEngine';
import { defaultMaterialPatch } from '../../src/services/design/materialSlots';
import { defaultDesignName } from '../../src/services/app/appInfo';

/** Lengths in m. */
export interface RocketSpec {
  noseCone: {
    length: number;
    aftRadius: number;
    thickness: number;
    shape?: NoseShape;
    /** Bulk density kg/m^3; omit for OpenRocket's default material. */
    materialDensity?: number;
    material?: string;
    /** Spelled as `MaterialGroup.getDatabaseString()` does, so the desktop files it the same. */
    materialGroup?: string;
  };
  bodyTube: {
    length: number;
    outerRadius: number;
    thickness: number;
    materialDensity?: number;
    material?: string;
    materialGroup?: string;
  };
  fins: {
    count: number;
    rootChord: number;
    tipChord: number;
    sweep: number;
    height: number;
    thickness: number;
    materialDensity?: number;
    material?: string;
    materialGroup?: string;
  };
  motorMount: {
    length: number;
    outerRadius: number;
    thickness: number;
  };
  parachute?: {
    diameter: number;
    dragCoefficient?: number;
  };
}

export function specToTree(spec: RocketSpec): { tree: RocketTree; mountId: string } {
  const mountId = 'mount';
  // Without a material the panel reads "Not specified" while the kernel flies its default.
  const material = (type: string, m?: { materialDensity?: number; material?: string; materialGroup?: string }) =>
    m?.materialDensity
      ? {
          density: m.materialDensity,
          ...(m.material ? { materialName: m.material } : {}),
          ...(m.materialGroup ? { materialGroup: m.materialGroup } : {}),
        }
      : defaultMaterialPatch(type, {});

  const nose: ComponentNode = {
    type: 'nosecone',
    id: 'nose',
    shape: spec.noseCone.shape ?? 'ogive',
    length: spec.noseCone.length,
    aftRadius: spec.noseCone.aftRadius,
    thickness: spec.noseCone.thickness,
    ...material('nosecone', spec.noseCone),
  };
  const body: ComponentNode = {
    type: 'bodytube',
    id: 'body',
    length: spec.bodyTube.length,
    outerRadius: spec.bodyTube.outerRadius,
    thickness: spec.bodyTube.thickness,
    ...material('bodytube', spec.bodyTube),
    children: [
      {
        type: 'trapezoidfinset',
        id: 'fins',
        finCount: spec.fins.count,
        rootChord: spec.fins.rootChord,
        tipChord: spec.fins.tipChord,
        sweep: spec.fins.sweep,
        height: spec.fins.height,
        thickness: spec.fins.thickness,
        position: { method: 'bottom', offset: 0 },
        ...material('trapezoidfinset', spec.fins),
      },
      {
        type: 'innertube',
        id: mountId,
        motorMount: true,
        length: spec.motorMount.length,
        outerRadius: spec.motorMount.outerRadius,
        thickness: spec.motorMount.thickness,
        // ~0.25 in (6.35 mm)
        position: { method: 'bottom', offset: 0 },
        motorOverhang: 0.00635,
        ...material('innertube'),
      },
      {
        type: 'centeringring',
        id: 'ring-fore',
        outerRadius: spec.bodyTube.outerRadius - spec.bodyTube.thickness,
        innerRadius: spec.motorMount.outerRadius,
        length: 0.003,
        ...material('centeringring'),
        position: { method: 'top', offset: Math.max(0, spec.bodyTube.length - spec.motorMount.length) },
      },
      {
        type: 'centeringring',
        id: 'ring-aft',
        outerRadius: spec.bodyTube.outerRadius - spec.bodyTube.thickness,
        innerRadius: spec.motorMount.outerRadius,
        length: 0.003,
        ...material('centeringring'),
        position: { method: 'bottom', offset: 0 },
      },
      ...(spec.parachute
        ? [
            {
              type: 'parachute',
              id: 'chute',
              diameter: spec.parachute.diameter,
              cd: spec.parachute.dragCoefficient ?? 0.8,
              lineCount: 6,
              lineLength: 0.3,
              // Without it the kernel falls back to ejection.
              deployEvent: 'apogee',
              deployAltitude: 200,
              deployDelay: 0,
              ...material('parachute'),
              position: { method: 'top', offset: 0.02 },
            } as ComponentNode,
          ]
        : []),
    ],
  };
  return {
    tree: {
      name: defaultDesignName(),
      components: [{ type: 'stage', name: 'Sustainer', id: 's1', children: [nose, body] }],
    },
    mountId,
  };
}
