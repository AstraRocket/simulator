import { describe, it, expect } from 'vitest';
import {
  PAGE_MARGIN_MM,
  SIDE_VIEW_BAND_MM,
  finSetsOf,
  hexToRgbTuple,
  pageFrame,
  sideViewOrigin,
  sideViewScale,
  templateFits,
} from '../../../src/services/report/reportPdf';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';

const A4_PORTRAIT = pageFrame(210, 297);
const A4_LANDSCAPE = pageFrame(297, 210);
const LETTER_PORTRAIT = pageFrame(215.9, 279.4);

describe('pageFrame', () => {
  it('insets the page by the margin on all four sides', () => {
    expect(PAGE_MARGIN_MM).toBe(12);
    expect(A4_PORTRAIT).toEqual({ margin: 12, contentWidth: 186, bottom: 285 });
  });

  it('measures Letter and landscape from their own dimensions', () => {
    expect(LETTER_PORTRAIT.contentWidth).toBeCloseTo(191.9, 9);
    expect(LETTER_PORTRAIT.bottom).toBeCloseTo(267.4, 9);
    expect(A4_LANDSCAPE).toEqual({ margin: 12, contentWidth: 273, bottom: 198 });
  });
});

describe('templateFits: a template prints 1:1 or not at all', () => {
  it('accepts one that exactly fills the drawable area', () => {
    expect(templateFits(186, 273, A4_PORTRAIT)).toBe(true);
  });

  it('refuses one a hair too wide or too tall rather than shrinking it', () => {
    expect(templateFits(186.1, 273, A4_PORTRAIT)).toBe(false);
    expect(templateFits(186, 273.1, A4_PORTRAIT)).toBe(false);
  });

  it('trades width for height when the reader picks landscape', () => {
    expect(templateFits(250, 60, A4_PORTRAIT)).toBe(false);
    expect(templateFits(250, 60, A4_LANDSCAPE)).toBe(true);
    expect(templateFits(60, 250, A4_PORTRAIT)).toBe(true);
    expect(templateFits(60, 250, A4_LANDSCAPE)).toBe(false);
  });
});

describe('sideViewScale: the side view is fit-to-page, NOT 1:1', () => {
  it('fills the content width for a long, slender rocket', () => {
    const scale = sideViewScale(1000, 100, A4_PORTRAIT);
    expect(scale).toBeCloseTo(0.186, 9);
    expect(1000 * scale).toBeCloseTo(A4_PORTRAIT.contentWidth, 9);
  });

  it('lets the band bind for a short, fat one', () => {
    expect(sideViewScale(300, 100, A4_PORTRAIT)).toBeCloseTo(SIDE_VIEW_BAND_MM / 100, 9);
  });

  it('never divides by a zero height', () => {
    expect(sideViewScale(186, 0, A4_PORTRAIT)).toBe(1);
  });
});

describe('sideViewOrigin', () => {
  it('centers the scaled drawing across the content width', () => {
    expect(sideViewOrigin(100, 20, 1, 50, A4_PORTRAIT).ox).toBeCloseTo(55, 9);
  });

  it('puts the axis on the block midline, because the body is drawn about ±radius', () => {
    // fillScaled draws with sy = −scale about oy.
    expect(sideViewOrigin(100, 20, 1, 50, A4_PORTRAIT).oy).toBeCloseTo(60, 9);
  });

  it('starts at the margin when the drawing fills the width', () => {
    expect(sideViewOrigin(186, 10, 1, 12, A4_PORTRAIT).ox).toBeCloseTo(A4_PORTRAIT.margin, 9);
  });
});

describe('hexToRgbTuple: the template stroke and fill', () => {
  it('reads six-digit hex, with or without the hash, in either case', () => {
    expect(hexToRgbTuple('#ff8800')).toEqual([255, 136, 0]);
    expect(hexToRgbTuple('ff8800')).toEqual([255, 136, 0]);
    expect(hexToRgbTuple('  #FF8800  ')).toEqual([255, 136, 0]);
  });

  it('falls back to near-black rather than NaN for anything else', () => {
    for (const bad of ['', 'nonsense', '#12345', '#1234567', 'rgb(1,2,3)']) {
      expect(hexToRgbTuple(bad), `hexToRgbTuple(${JSON.stringify(bad)})`).toEqual([17, 24, 39]);
    }
  });

  it('takes the three-digit shorthand, as every color reader does', () => {
    expect(hexToRgbTuple('#f80')).toEqual([255, 136, 0]);
  });
});

describe('finSetsOf: which fin templates get printed at all', () => {
  const node = (o: object) => o as unknown as ComponentNode;
  const stage = node({
    type: 'stage',
    children: [
      node({ type: 'nosecone', id: 'n' }),
      node({
        type: 'bodytube',
        id: 'b',
        children: [
          node({ type: 'trapezoidfinset', id: 'f1' }),
          node({ type: 'podset', id: 'p', children: [node({ type: 'freeformfinset', id: 'f2' })] }),
        ],
      }),
    ],
  });

  it('finds fin sets at any depth, in tree order, and nothing else', () => {
    expect(finSetsOf(stage).map((n) => n.id)).toEqual(['f1', 'f2']);
  });

  it('returns nothing for a stage with no children', () => {
    expect(finSetsOf(node({ type: 'stage' }))).toEqual([]);
  });
});

describe('finSetsOf: tube fins have no template', () => {
  const node = (o: object) => o as unknown as ComponentNode;

  it('skips a tube fin set while keeping the flat ones beside it', () => {
    // In OpenRocket TubeFinSet extends Tube, so never reaches PrintableFinSet.
    const stage = node({
      type: 'stage',
      children: [
        node({
          type: 'bodytube',
          id: 'b',
          children: [
            node({ type: 'trapezoidfinset', id: 'flat' }),
            node({ type: 'tubefinset', id: 'tubes', finCount: 6, length: 0.08, outerRadius: 0.012 }),
          ],
        }),
      ],
    });
    expect(finSetsOf(stage).map((n) => n.id)).toEqual(['flat']);
  });

  it('emits no templates at all for a rocket finned only with tubes', () => {
    const stage = node({
      type: 'stage',
      children: [node({ type: 'bodytube', id: 'b', children: [node({ type: 'tubefinset', id: 'tubes' })] })],
    });
    expect(finSetsOf(stage)).toEqual([]);
  });
});
