import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { KERNEL_DEFAULTS } from '../../../src/tree/kernelDefaults';
import {
  GUIDE_WIDTH_MM,
  PAPER_THICKNESS_M,
  TWO_PI,
  cutPoints,
  guideCircumferenceMm,
  markingGuides,
  mountAngles,
  radialOrigin,
  zeroTwoPi,
} from '../../../src/services/report/markingGuide';

const node = (o: object) => o as unknown as ComponentNode;
const tree = (...components: ComponentNode[]) => ({ name: 'T', components }) as unknown as RocketTree;
const deg = (d: number) => (d * Math.PI) / 180;

describe('guideCircumferenceMm', () => {
  it('wraps the PAPER, not the tube: one paper thickness further out', () => {
    expect(guideCircumferenceMm(0.038)).toBeCloseTo(2 * Math.PI * 38.1, 9);
    expect(guideCircumferenceMm(0.038) - 2 * Math.PI * 38).toBeCloseTo(2 * Math.PI * 0.1, 9);
  });

  it('is a larger share of a small tube (why the correction exists at all)', () => {
    const err = (r: number) => (guideCircumferenceMm(r) - r * TWO_PI * 1000) / (r * TWO_PI * 1000);
    expect(err(0.013)).toBeGreaterThan(err(0.076));
    expect(err(0.013)).toBeCloseTo(PAPER_THICKNESS_M / 0.013, 9);
  });
});

describe('zeroTwoPi', () => {
  it('folds both directions into [0, 2pi)', () => {
    expect(zeroTwoPi(-Math.PI / 2)).toBeCloseTo(1.5 * Math.PI, 12);
    expect(zeroTwoPi(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(zeroTwoPi(0)).toBe(0);
  });

  it('folds exactly 2pi to 0, where upstream leaves it at 2pi', () => {
    // Upstream's `while (v > TWO_PI)` misses equality, opening a phantom seam gap.
    expect(zeroTwoPi(TWO_PI)).toBe(0);
  });
});

describe('radialOrigin', () => {
  it('puts the seam half a turn from a lone mark', () => {
    expect(radialOrigin([0])).toBeCloseTo(Math.PI, 12);
    expect(radialOrigin([deg(30)])).toBeCloseTo(deg(210), 12);
  });

  it('splits the widest gap so no mark lands on the seam', () => {
    const marks = [0, deg(120), deg(240)];
    const o = radialOrigin(marks);
    const away = marks.map((a) => {
      const d = zeroTwoPi(a - o);
      return Math.min(d, TWO_PI - d);
    });
    expect(Math.min(...away)).toBeCloseTo(deg(60), 9);
  });

  it('uses the wrap-around gap when the marks are bunched', () => {
    const marks = [deg(10), deg(20), deg(40)];
    expect(radialOrigin(marks)).toBeCloseTo(deg(205), 9);
  });

  it('is 0 with nothing to mark', () => {
    expect(radialOrigin([])).toBe(0);
  });
});

describe('mountAngles', () => {
  it('spaces a fin set evenly from its base rotation', () => {
    const fins = node({ type: 'trapezoidfinset', id: 'f', finCount: 4, rotation: deg(45) });
    expect(mountAngles(fins).map((a) => Math.round((a * 180) / Math.PI))).toEqual([45, 135, 225, 315]);
  });

  it('reads a fin count the design never set from the kernel default', () => {
    expect(mountAngles(node({ type: 'trapezoidfinset', id: 'f' })).length).toBe(3);
    expect(mountAngles(node({ type: 'tubefinset', id: 't' })).length).toBe(6);
  });

  it('gives a lug and a rail button one mark, at the angle the .ork writer saves', () => {
    expect(mountAngles(node({ type: 'launchlug', id: 'l' }))).toEqual([Math.PI]);
    expect(mountAngles(node({ type: 'railbutton', id: 'r', angleOffset: deg(90) }))).toEqual([deg(90)]);
  });
});

describe('cutPoints', () => {
  it('leaves a strip that fits in one piece', () => {
    expect(cutPoints([10, 50], 120, 260)).toEqual([0, 120]);
  });

  it('cuts a 4 in tube into as few pieces as the page allows', () => {
    const c = guideCircumferenceMm(0.049);
    const cuts = cutPoints([20, 120, 220], c, 264);
    expect(cuts).toHaveLength(3);
    expect(cuts[0]).toBe(0);
    expect(cuts[cuts.length - 1]).toBe(c);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]! - cuts[i - 1]!).toBeLessThanOrEqual(264);
  });

  it('puts the join in a gap rather than on a mark', () => {
    const marks = [40, 150, 260];
    const cuts = cutPoints(marks, 300, 200);
    expect(cuts).toHaveLength(3);
    const join = cuts[1]!;
    for (const m of marks) expect(Math.abs(join - m)).toBeGreaterThan(20);
  });

  it('never lets a piece outgrow the page to find a gap', () => {
    const marks = [5, 10, 15, 20, 290, 295];
    const cuts = cutPoints(marks, 300, 160);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]! - cuts[i - 1]!).toBeLessThanOrEqual(160);
    expect(cuts[cuts.length - 1]).toBe(300);
  });

  it('keeps the pieces in order and covers the whole wrap', () => {
    const cuts = cutPoints([100, 400, 700], 900, 250);
    expect(cuts).toHaveLength(5);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]!).toBeGreaterThan(cuts[i - 1]!);
    expect(cuts[cuts.length - 1]! - cuts[0]!).toBe(900);
  });
});

describe('markingGuides', () => {
  const finned = (children: object[], tubeProps: object = {}) =>
    tree(
      node({
        type: 'stage',
        id: 's',
        children: [
          node({
            type: 'bodytube',
            id: 'body',
            name: 'Body',
            outerRadius: 0.038,
            ...tubeProps,
            children: children.map(node),
          }),
        ],
      }),
    );

  it('consolidates every angular part on one tube onto one strip', () => {
    const { guides } = markingGuides(
      finned([
        { type: 'trapezoidfinset', id: 'f', name: 'Fins', finCount: 3 },
        { type: 'tubefinset', id: 'tf', name: 'Tubes', finCount: 6 },
        { type: 'launchlug', id: 'l', name: 'Lug', angleOffset: deg(60) },
        { type: 'railbutton', id: 'rb', name: 'Button', angleOffset: deg(60) },
      ]),
    );
    expect(guides).toHaveLength(1);
    expect(guides[0]!.marks).toHaveLength(3 + 6 + 1 + 1);
    expect(new Set(guides[0]!.marks.map((m) => m.name))).toEqual(new Set(['Fins', 'Tubes', 'Lug', 'Button']));
  });

  it('places marks along the wrap by angle from the seam, in order', () => {
    const { guides } = markingGuides(finned([{ type: 'trapezoidfinset', id: 'f', finCount: 4 }]));
    const g = guides[0]!;
    expect(g.circumferenceMm).toBeCloseTo(guideCircumferenceMm(0.038), 12);
    const gaps = g.marks.slice(1).map((m, i) => m.posMm - g.marks[i]!.posMm);
    for (const gap of gaps) expect(gap).toBeCloseTo(g.circumferenceMm / 4, 9);
    expect(g.marks[0]!.posMm).toBeGreaterThan(0);
    expect(g.marks[g.marks.length - 1]!.posMm).toBeLessThan(g.circumferenceMm);
  });

  it('marks a lug relative to the fins, which is the whole point of the guide', () => {
    const { guides } = markingGuides(
      finned([
        { type: 'trapezoidfinset', id: 'f', name: 'Fins', finCount: 3 },
        { type: 'launchlug', id: 'l', name: 'Lug', angleOffset: deg(60) },
      ]),
    );
    const g = guides[0]!;
    const lug = g.marks.findIndex((m) => m.name === 'Lug');
    expect(lug).toBeGreaterThan(0);
    const before = g.marks[lug - 1]!.posMm;
    const after = g.marks[lug + 1]!.posMm;
    expect(g.marks[lug]!.posMm - before).toBeCloseTo(after - g.marks[lug]!.posMm, 9);
  });

  it('carries the cant and the root chord a canted fin is marked from', () => {
    const { guides } = markingGuides(
      finned([{ type: 'trapezoidfinset', id: 'f', finCount: 3, rootChord: 0.06, cant: deg(3) }]),
    );
    const m = guides[0]!.marks[0]!;
    expect(m.cant).toBeCloseTo(deg(3), 12);
    expect(m.rootChordMm).toBeCloseTo(60, 9);
  });

  it('marks a cant past the kernel limit at the limit the kernel flies', () => {
    const { guides } = markingGuides(
      finned([{ type: 'trapezoidfinset', id: 'f', finCount: 3, rootChord: 0.06, cant: deg(40) }]),
    );
    expect(guides[0]!.marks[0]!.cant).toBeCloseTo(deg(15), 12);
  });

  it('measures a freeform fin root from its outline, not a rootChord key', () => {
    const { guides } = markingGuides(
      finned([
        {
          type: 'freeformfinset',
          id: 'f',
          finCount: 3,
          cant: deg(2),
          points: [
            [0, 0],
            [0.02, 0.05],
            [0.07, 0],
          ],
        },
      ]),
    );
    expect(guides[0]!.marks[0]!.rootChordMm).toBeCloseTo(70, 9);
  });

  it('leaves tube fins uncanted: a tube fin set has no cant to read', () => {
    const { guides } = markingGuides(finned([{ type: 'tubefinset', id: 'tf', finCount: 4, cant: deg(5) }]));
    for (const m of guides[0]!.marks) expect(m.cant).toBe(0);
  });

  it('gives a tube with only a lug no guide, and says so', () => {
    const { guides, omitted } = markingGuides(finned([{ type: 'launchlug', id: 'l', name: 'Lug' }]));
    expect(guides).toEqual([]);
    expect(omitted).toEqual([{ name: 'Lug', type: 'launchlug', reason: 'noFins' }]);
  });

  it('does not wrap a nose cone, and names what it could not mark', () => {
    const t = tree(
      node({
        type: 'stage',
        id: 's',
        children: [
          node({
            type: 'nosecone',
            id: 'nose',
            aftRadius: 0.038,
            children: [node({ type: 'launchlug', id: 'l', name: 'Nose lug' })],
          }),
          node({
            type: 'bodytube',
            id: 'body',
            outerRadius: 0.038,
            children: [node({ type: 'trapezoidfinset', id: 'f', finCount: 3 })],
          }),
        ],
      }),
    );
    const { guides, omitted } = markingGuides(t);
    expect(guides.map((g) => g.tubeId)).toEqual(['body']);
    expect(guides[0]!.marks).toHaveLength(3);
    expect(omitted).toEqual([{ name: 'Nose lug', type: 'launchlug', reason: 'noWrap' }]);
  });

  it('gives each finned tube its own strip at its own circumference', () => {
    const t = tree(
      node({
        type: 'stage',
        id: 's',
        children: [
          node({
            type: 'bodytube',
            id: 'upper',
            outerRadius: 0.038,
            children: [node({ type: 'trapezoidfinset', id: 'f1', finCount: 3 })],
          }),
          node({
            type: 'bodytube',
            id: 'lower',
            outerRadius: 0.05,
            children: [node({ type: 'tubefinset', id: 'f2', finCount: 6 })],
          }),
          node({ type: 'bodytube', id: 'bare', outerRadius: 0.038 }),
        ],
      }),
    );
    const { guides } = markingGuides(t);
    expect(guides.map((g) => g.tubeId)).toEqual(['upper', 'lower']);
    expect(guides[1]!.circumferenceMm).toBeCloseTo(guideCircumferenceMm(0.05), 12);
  });

  it('falls back to the kernel body-tube radius rather than collapsing the strip', () => {
    const { guides } = markingGuides(
      finned([{ type: 'trapezoidfinset', id: 'f', finCount: 3 }], { outerRadius: null }),
    );
    expect(guides[0]!.circumferenceMm).toBeCloseTo(guideCircumferenceMm(KERNEL_DEFAULTS.bodytube.outerRadius), 12);
  });
});

describe('tab slots', () => {
  // The kernel's tab (`FinSet.getTabFrontEdge()`) measured forward from the root's aft end.
  const slotOf = (fin: object, tubeProps: object = {}) =>
    markingGuides(
      tree(
        node({
          type: 'stage',
          id: 's',
          children: [
            node({
              type: 'bodytube',
              id: 'body',
              outerRadius: 0.02,
              ...tubeProps,
              children: [node({ type: 'trapezoidfinset', id: 'f', finCount: 3, rootChord: 0.1, ...fin })],
            }),
          ],
        }),
      ),
    ).guides[0]!.marks[0]!.slot;
  const tab = { tabHeight: 0.01, tabLength: 0.06, thickness: 0.003 };

  it('centers a middle tab on the root', () => {
    const slot = slotOf({ ...tab, tabOffsetMethod: 'middle', tabOffset: 0 })!;
    expect(slot.aftMm).toBeCloseTo(20, 9);
    expect(slot.foreMm).toBeCloseTo(80, 9);
    expect(slot.widthMm).toBeCloseTo(3, 9);
  });

  it('measures a tab placed from the root front or back by its own method', () => {
    const top = slotOf({ ...tab, tabOffsetMethod: 'top', tabOffset: 0.005 })!;
    expect(top.aftMm).toBeCloseTo(35, 9);
    expect(top.foreMm).toBeCloseTo(95, 9);
    const bottom = slotOf({ ...tab, tabOffsetMethod: 'bottom', tabOffset: -0.005 })!;
    expect(bottom.aftMm).toBeCloseTo(5, 9);
    expect(bottom.foreMm).toBeCloseTo(65, 9);
  });

  it('is as wide as the kernel default fin when the design states no thickness', () => {
    const slot = slotOf({ tabHeight: 0.01, tabLength: 0.06 })!;
    expect(slot.widthMm).toBeCloseTo(KERNEL_DEFAULTS.trapezoidfinset.thickness * 1000, 9);
  });

  it('has none without a tab, on a canted fin, or through a filled tube', () => {
    expect(slotOf({ thickness: 0.003 })).toBeNull();
    expect(slotOf({ ...tab, cant: deg(2) })).toBeNull();
    expect(slotOf(tab, { filled: true })).toBeNull();
  });

  it('gives tube fins, lugs and rail buttons none', () => {
    const { guides } = markingGuides(
      tree(
        node({
          type: 'stage',
          id: 's',
          children: [
            node({
              type: 'bodytube',
              id: 'body',
              outerRadius: 0.02,
              children: [
                node({ type: 'trapezoidfinset', id: 'f', finCount: 3, rootChord: 0.1, ...tab }),
                node({ type: 'tubefinset', id: 'tf', finCount: 6, ...tab }),
                node({ type: 'launchlug', id: 'l', angleOffset: deg(60) }),
                node({ type: 'railbutton', id: 'rb', angleOffset: deg(90) }),
              ],
            }),
          ],
        }),
      ),
    );
    const marks = guides[0]!.marks;
    expect(marks.filter((m) => m.slot).map((m) => m.type)).toEqual([
      'trapezoidfinset',
      'trapezoidfinset',
      'trapezoidfinset',
    ]);
  });
});

describe('GUIDE_WIDTH_MM', () => {
  it('is upstream 3 inches, and two strips still fit a portrait page', () => {
    expect(GUIDE_WIDTH_MM).toBeCloseTo(76.2, 9);
    expect(2 * GUIDE_WIDTH_MM + 10).toBeLessThanOrEqual(186);
  });
});
