// Keep heavy imports out so asking what a part exports stays out of the exporter bundle.

export type ExportFormat = 'stl' | 'obj' | 'glb' | '3mf' | 'dxf';

export const DISC_TYPES = new Set(['centeringring', 'bulkhead', 'tubecoupler', 'engineblock']);

const MESH_TYPES = new Set([
  'nosecone',
  'bodytube',
  'transition',
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'innertube',
  'launchlug',
  'tubefinset',
  ...DISC_TYPES,
]);

const DXF_CUTTABLE = new Set(['trapezoidfinset', 'ellipticalfinset', 'freeformfinset', 'centeringring', 'bulkhead']);

export const isPrintable = (type: string): boolean => MESH_TYPES.has(type);

export function componentFormats(type: string): ExportFormat[] {
  const formats: ExportFormat[] = [];
  // 3MF last so the other three keep their menu positions.
  if (MESH_TYPES.has(type)) formats.push('stl', 'obj', 'glb', '3mf');
  if (DXF_CUTTABLE.has(type)) formats.push('dxf');
  return formats;
}
