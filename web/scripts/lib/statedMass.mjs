const DENSITY_FROM_MASS = new Set([
  'bodytube',
  'launchlug',
  'tubecoupler',
  'centeringring',
  'engineblock',
  'bulkhead',
  'nosecone',
  'transition',
  'railbutton',
]);

/**
 * Mass in kg. A rail button keeps its own `mass` (the `RailButton.loadFromPreset` override).
 * 'degenerate' means desktop divides by zero too, so neither build applies it.
 */
export function applyStatedMass(row, mass, volumeOf, desktopHasVolume = true) {
  if (row.type !== 'railbutton') delete row.mass;
  if (!mass) return null;
  if (row.type === 'parachute') {
    row.mass = mass;
    return 'applied';
  }
  if (!DENSITY_FROM_MASS.has(row.type)) return null;
  const volume = volumeOf(row);
  if (!volume) return desktopHasVolume ? 'no-volume' : 'degenerate';
  row.materialDensity = mass / volume;
  if (row.type !== 'railbutton') row.mass = mass;
  return 'applied';
}

export function statedMassTally() {
  let massed = 0;
  const noVolume = [];
  const degenerate = [];
  const label = (row, mass) =>
    `${row.type} ${row.mfr} ${String(row.partNo).trim()} (${Number((mass * 1000).toPrecision(4))} g)`;
  return {
    apply(row, mass, volumeOf, desktopHasVolume = true) {
      const applied = applyStatedMass(row, mass, volumeOf, desktopHasVolume);
      if (applied === 'applied') massed++;
      else if (applied === 'no-volume') noVolume.push(label(row, mass));
      else if (applied === 'degenerate') degenerate.push(label(row, mass));
      return applied;
    },
    get massed() {
      return massed;
    },
    get degenerate() {
      return degenerate;
    },
    refusal() {
      return noVolume.length
        ? `refusing to write: the engine gives these parts no volume to spread their stated mass over: ${noVolume.join(', ')}. Nothing written.`
        : null;
    },
  };
}
