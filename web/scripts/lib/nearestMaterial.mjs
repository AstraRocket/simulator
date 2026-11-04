// cspell:ignore ldpe -- a catalog material name, lowercased as the key.
// Stand-ins for part materials with no density, which desktop would weigh at 0 g.
const NEAREST = new Map([
  ['BULK\u0000balsa, bulk, estes typical', 'Balsa'],
  ['BULK\u0000light ply', 'Plywood (birch)'],
  ['SURFACE\u0000paper', 'Paper (office)'],
  ['SURFACE\u0000polyethylene ldpe', 'Polyethylene (thin)'],
  ['SURFACE\u0000rip stop nylon', 'Ripstop nylon'],
]);

export function nearestMaterial(type, name, densityOf) {
  const nearest = NEAREST.get(`${type}\u0000${name.toLowerCase()}`);
  if (!nearest) return undefined;
  const density = densityOf(type, nearest);
  if (!(density > 0))
    throw new Error(`nearestMaterial: the stand-in "${nearest}" (${type}) is not a built-in material`);
  return { material: nearest, materialDensity: density };
}
