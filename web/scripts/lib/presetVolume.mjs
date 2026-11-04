// Must match `catalogPatch` in src/services/design/treeEdit.ts.
// A URL rather than a path: a Windows drive letter is not an import scheme.
const ENGINE = new URL('../../src/engine/vendor/openrocket-engine.mjs', import.meta.url).href;

/** `SymmetricComponent.DEFAULT_THICKNESS` (m). */
const DEFAULT_WALL = 0.002;

/** As `Transition.loadFromPreset` applies it: radius clamped to `end`, solid when filled, never capped. */
function shoulder(prefix, diameter, length, end, row) {
  if (diameter == null) return {};
  const key = (k) => (prefix ? `${prefix}${k}` : k.charAt(0).toLowerCase() + k.slice(1));
  const radius = Math.min(diameter / 2, end);
  const wall = row.filled ? diameter / 2 : row.thickness;
  return {
    [key('ShoulderRadius')]: radius,
    [key('ShoulderCapped')]: false,
    ...(length == null ? {} : { [key('ShoulderLength')]: length }),
    ...(wall == null ? {} : { [key('ShoulderThickness')]: wall }),
  };
}

/** Density 1, so the reported mass is the volume. */
function partNode(row) {
  const unit = { id: 'probe', density: 1, materialName: 'unit' };
  const tubeWall = (r) =>
    r.innerDiameter ? { thickness: Math.max(0.0001, (r.outerDiameter - r.innerDiameter) / 2) } : {};
  switch (row.type) {
    case 'nosecone': {
      const radius = row.outerDiameter / 2;
      return {
        ...unit,
        type: 'nosecone',
        shape: row.shape,
        length: row.length,
        aftRadius: radius,
        filled: !!row.filled,
        thickness: row.filled ? radius : (row.thickness ?? DEFAULT_WALL),
        ...shoulder('', row.shoulderDiameter, row.shoulderLength, radius, row),
      };
    }
    case 'transition':
      return {
        ...unit,
        type: 'transition',
        shape: row.shape,
        length: row.length,
        foreRadius: row.foreOuterDiameter / 2,
        aftRadius: row.aftOuterDiameter / 2,
        filled: !!row.filled,
        ...(row.thickness != null && !row.filled ? { thickness: row.thickness } : {}),
        ...shoulder('fore', row.foreShoulderDiameter, row.foreShoulderLength, row.foreOuterDiameter / 2, row),
        ...shoulder('aft', row.aftShoulderDiameter, row.aftShoulderLength, row.aftOuterDiameter / 2, row),
      };
    case 'bodytube':
    case 'tubecoupler':
    case 'engineblock':
    case 'launchlug':
      return { ...unit, type: row.type, outerRadius: row.outerDiameter / 2, length: row.length, ...tubeWall(row) };
    case 'centeringring':
      return {
        ...unit,
        type: 'centeringring',
        outerRadius: row.outerDiameter / 2,
        innerRadius: (row.innerDiameter ?? 0) / 2,
        length: row.length,
      };
    case 'bulkhead':
      return { ...unit, type: 'bulkhead', outerRadius: row.outerDiameter / 2, length: row.length };
    // No mass override: `makeRailButton` divides by `RailButton.getComponentVolume`.
    case 'railbutton':
      return {
        ...unit,
        type: 'railbutton',
        outerDiameter: row.outerDiameter,
        height: row.height,
        ...(row.innerDiameter != null ? { innerDiameter: row.innerDiameter } : {}),
        ...(row.baseHeight != null ? { baseHeight: row.baseHeight } : {}),
        ...(row.flangeHeight != null ? { flangeHeight: row.flangeHeight } : {}),
        ...(row.screwHeight != null ? { screwHeight: row.screwHeight } : {}),
      };
    default:
      return null;
  }
}

function design(probe) {
  const tube = (children = []) => ({
    type: 'bodytube',
    id: 'host',
    length: 1,
    outerRadius: 0.2,
    thickness: 0.001,
    children,
  });
  const chain =
    probe.type === 'nosecone' || probe.type === 'bodytube'
      ? [probe]
      : probe.type === 'transition'
        ? [tube(), probe]
        : probe.type === 'engineblock'
          ? [
              tube([
                { type: 'innertube', id: 'mmt', length: 0.2, outerRadius: 0.1, thickness: 0.001, children: [probe] },
              ]),
            ]
          : [tube([probe])];
  return { components: [{ type: 'stage', id: 'st', children: chain }] };
}

/** Row to volume (m³). */
export async function presetVolumes() {
  globalThis.$rt_putStdoutCustom ??= () => {};
  globalThis.$rt_putStderrCustom ??= () => {};
  const engine = await import(ENGINE);
  return (row) => {
    const probe = partNode(row);
    if (!probe) return null;
    engine.reset();
    const handle = engine.buildRocket(JSON.stringify(design(probe)));
    const info = JSON.parse(engine.getComponentInfo(handle, 'probe'));
    return Number.isFinite(info.mass) && info.mass > 0 ? info.mass : null;
  };
}
