import { describe, expect, it } from 'vitest';
import { buildSchematicShapes } from '../../../src/components/canvas/schematicShapes';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { partLabel } from '../../../src/i18n/format';
import i18n from '../../../src/i18n';

/**
 * The side view's hover tag and `<title>` name a part as every view does
 * (`partLabel`): a cleared Name field writes `name: ''`, and a blank or
 * whitespace name falls back to the translated type rather than an empty tag.
 */
describe('the side view names a part', () => {
  const extentName = (name: string | undefined) => {
    const tube = { type: 'bodytube', id: 'b', length: 0.3, outerRadius: 0.025, name } as unknown as ComponentNode;
    const { extents } = buildSchematicShapes({
      chain: [tube],
      ctx: { scale: 1000, cy: 200, x0: 0 },
      scale: 1000,
      w: 800,
      h: 400,
      roll: 0,
      uid: 't',
      setHoverId: () => {},
      partName: (n) => partLabel(i18n.t, n),
    });
    return extents.get('b')!.name;
  };

  it('falls back to the type for an empty or blank name', () => {
    const type = partLabel(i18n.t, { type: 'bodytube' });
    expect(extentName('')).toBe(type);
    expect(extentName('   ')).toBe(type);
    expect(extentName(undefined)).toBe(type);
  });

  it('keeps a name of its own, trimmed', () => {
    expect(extentName('  Booster  ')).toBe('Booster');
  });
});
