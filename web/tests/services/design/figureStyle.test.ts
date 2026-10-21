import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import {
  dashOf,
  LINE_STYLES,
  readFigureStyles,
  readLineStyle,
  withFigureDefaults,
} from '../../../src/services/design/figureStyle';

/**
 * A part's figure style: desktop's figure color and line style, with the
 * per-type defaults "Save as default style" keeps.
 */

const node = (extra: Record<string, unknown>) => ({ type: 'bodytube', ...extra }) as unknown as ComponentNode;

describe('line styles', () => {
  it("are LineStyle's constants, as RocketComponentSaver writes them, with their dashes", () => {
    const src = readFileSync(
      join(__dirname, '../../../../engine-java/src/java/info/openrocket/core/util/LineStyle.java'),
      'utf8',
    );
    const desktop = [...src.matchAll(/^\s*(\w+)\("LineStyle\.[^"]+", new float\[\] \{([^}]*)\}\)/gm)].map((m) => ({
      name: m[1]!.toLowerCase(),
      dashes: m[2]!.split(',').map((d) => Number(d.trim().replace(/f$/, ''))),
    }));
    expect(desktop.map((d) => d.name)).toEqual([...LINE_STYLES]);
    for (const { name, dashes } of desktop) {
      const dash = dashOf(node({ lineStyle: name }));
      // Solid is {10, 0}: no gap, drawn as no dash at all.
      expect(dash).toBe(dashes[1] === 0 ? 'none' : dashes.join(' '));
    }
  });

  it("leaves a part with no style of its own to the view's dashing", () => {
    expect(dashOf(node({}), '3 2')).toBe('3 2');
    expect(dashOf(node({}))).toBeUndefined();
    expect(dashOf(node({ lineStyle: 'wavy' }), '3 2')).toBe('3 2');
  });

  it('reads only the four names', () => {
    expect(readLineStyle('dashed')).toBe('dashed');
    expect(readLineStyle('DASHED')).toBeUndefined();
    expect(readLineStyle(3)).toBeUndefined();
  });
});

describe('saved defaults', () => {
  const tree = {
    components: [
      {
        id: 's',
        type: 'stage',
        children: [
          { id: 'a', type: 'bodytube' },
          { id: 'b', type: 'bodytube', color: '#010203', lineStyle: 'dotted' },
          { id: 'n', type: 'nosecone' },
        ],
      },
    ],
  } as unknown as RocketTree;
  const kids = (t: RocketTree) => t.components[0]!.children!;

  it('fill a part that has no style of its own, and only that', () => {
    const out = withFigureDefaults(tree, { bodytube: { color: '#aabbcc', lineStyle: 'dashed' } });
    expect(kids(out)[0]).toMatchObject({ color: '#aabbcc', lineStyle: 'dashed' });
    expect(kids(out)[1]).toMatchObject({ color: '#010203', lineStyle: 'dotted' });
    expect(kids(out)[2]).toBe(kids(tree)[2]);
  });

  it('never touch the design itself', () => {
    withFigureDefaults(tree, { bodytube: { color: '#aabbcc' } });
    expect(kids(tree)[0]!['color']).toBeUndefined();
  });

  it('give back the same tree when there are none', () => {
    expect(withFigureDefaults(tree, {})).toBe(tree);
  });

  it('are checked when read back from storage', () => {
    expect(
      readFigureStyles({
        bodytube: { color: '#ABCDEF', lineStyle: 'dashed' },
        nosecone: { color: 'url(evil)', lineStyle: 'zigzag' },
        fins: 'nonsense',
      }),
    ).toEqual({ bodytube: { color: '#abcdef', lineStyle: 'dashed' } });
  });
});
