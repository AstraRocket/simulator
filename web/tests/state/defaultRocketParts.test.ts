// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';
import { findNode } from '../../src/services/design/treeEdit';
import { DEFAULT_PRESETS } from '../../src/services/design/defaultRocket';
import { KERNEL_MATERIALS } from '../../src/tree/kernelDefaults';

type MaterialRow = { name: string; type: string; density: number; group: string };
type PartRow = {
  type: string;
  mfr: string;
  partNo: string;
  digest?: string;
  desc?: string;
  material?: string;
  materialDensity?: number;
  outerDiameter?: number;
  innerDiameter?: number;
  length?: number;
  diameter?: number;
  cd?: number | null;
  lineCount?: number;
  lineLength?: number;
  lineMaterial?: string;
  lineMaterialDensity?: number;
};

const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T;
const MATERIALS = read<MaterialRow[]>('materials.generated.json');
const PARTS = read<{ components: PartRow[] }>('components.generated.json').components;

const bulk = (name: string) => MATERIALS.find((m) => m.type === 'bulk' && m.name === name);
const row = (partNo: string) => PARTS.find((p) => p.mfr === 'Estes' && p.partNo === partNo);
const part = (id: string) => findNode(useWorkspaceStore.getState().tree, id) as unknown as Record<string, unknown>;

describe('the default rocket is built from catalog parts', () => {
  it.each(Object.entries(DEFAULT_PRESETS))('%s names a part the catalog still has', (_slot, preset) => {
    const found = row(preset.partNo);
    expect(found, `${preset.partNo} is no longer an Estes row in the component catalog`).toBeTruthy();
    expect(found!.type).toBe(preset.type);
    for (const key of [
      'outerDiameter',
      'innerDiameter',
      'length',
      'diameter',
      'materialDensity',
      'material',
      'desc',
      'cd',
      'lineCount',
      'lineLength',
      'lineMaterial',
      'lineMaterialDensity',
    ] as const) {
      const claimed = (preset as Record<string, unknown>)[key];
      if (claimed === undefined) continue;
      expect(found![key], `${preset.partNo}.${key}`).toBe(claimed);
    }
  });

  it.each([
    ['nose', 'nosecone', DEFAULT_PRESETS.nose.partNo],
    ['body', 'bodytube', DEFAULT_PRESETS.body.partNo],
    ['mount', 'bodytube', DEFAULT_PRESETS.mount.partNo],
    ['ring-fore', 'centeringring', DEFAULT_PRESETS.ring.partNo],
    ['ring-aft', 'centeringring', DEFAULT_PRESETS.ring.partNo],
    ['chute', 'parachute', DEFAULT_PRESETS.chute.partNo],
  ])('%s carries the preset link for %s', (id, type, partNo) => {
    expect(part(id)['preset']).toMatchObject({ type, manufacturer: 'Estes', partNo });
  });

  it('weighs the airframe as Estes paper, not as generic cardboard', () => {
    const body = part('body');
    expect(body['density']).toBe(DEFAULT_PRESETS.body.materialDensity);
    expect(body['materialName']).toBe(DEFAULT_PRESETS.body.material);
    expect(body['density']).not.toBe(KERNEL_MATERIALS.bulk.density);
  });

  it('cuts the fins from the material catalog’s own balsa', () => {
    const balsa = bulk('Balsa');
    expect(balsa, 'Balsa is no longer a bulk material in the catalog').toBeTruthy();
    const fins = part('fins');
    expect(fins['materialName']).toBe('Balsa');
    expect(fins['density']).toBe(balsa!.density);
    expect(fins['materialGroup']).toBe(balsa!.group);
  });

  it('has the four parts no preset database carries', () => {
    const parts: [string, string][] = [
      ['block', 'engineblock'],
      ['cord', 'shockcord'],
      ['wadding', 'masscomponent'],
      ['lug', 'launchlug'],
    ];
    for (const [id, type] of parts) {
      expect(part(id), id).toBeTruthy();
      expect(part(id)['type'], id).toBe(type);
    }
  });

  it('plugs the nose cone into the tube it is sold for', () => {
    expect(part('nose')['shoulderRadius']).toBe(DEFAULT_PRESETS.body.innerDiameter / 2);
    expect(part('nose')['shoulderLength']).toBeGreaterThan(0);
  });

  it('gives the parachute the canopy and lines its catalog row states', () => {
    // As `Parachute.loadFromPreset` gives them, with an automatic Cd for a row with none.
    const found = row(DEFAULT_PRESETS.chute.partNo)!;
    const chute = part('chute');
    expect(chute['surfaceMaterialName']).toBe(found.material);
    expect(chute['surfaceDensity']).toBe(found.materialDensity);
    expect(chute['lineMaterialName']).toBe(found.lineMaterial);
    expect(chute['lineDensity']).toBe(found.lineMaterialDensity);
    expect(chute['lineCount']).toBe(found.lineCount);
    expect(chute['lineLength']).toBe(found.lineLength);
    expect(chute['diameter']).toBe(found.diameter);
    expect(chute['cdAuto']).toBe(found.cd == null);
    expect(found.material).not.toBe(KERNEL_MATERIALS.surface.name);
  });

  it.each(Object.entries(DEFAULT_PRESETS).filter(([, preset]) => 'digest' in preset))(
    '%s carries the catalog’s own digest for its part',
    (_slot, preset) => {
      // Desktop rejects an `.ork` link without OpenRocket's digest.
      const found = row(preset.partNo);
      expect(found!.digest, `${preset.partNo} has no digest in the catalog`).toBeTruthy();
      expect(found!.digest).toBe((preset as { digest?: string }).digest);
    },
  );

  it('keeps most of the catalog digested', () => {
    const digested = PARTS.filter((p) => p.digest).length;
    expect(digested).toBeGreaterThan(PARTS.length * 0.7);
  });
});
