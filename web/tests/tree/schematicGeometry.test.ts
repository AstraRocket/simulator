import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../src/engine/openRocketEngine';
import { KERNEL_DEFAULTS } from '../../src/tree/kernelDefaults';
import {
  niceRulerStep,
  rulerGraduations,
  snapNear,
  calloutLayout,
  axialStart,
  computeSchematicLayout,
  profilePath,
  colorOf,
  hoverTagFor,
  unionBox,
  zoomAbout,
  zoomStep,
  MAX_ZOOM,
  marginText,
  figureToken,
  internalExtent,
} from '../../src/tree/schematicGeometry';
import i18n from '../../src/i18n';
import { fmtPercent } from '../../src/i18n/format';

const node = (o: object): ComponentNode => o as unknown as ComponentNode;

describe('internalExtent with no length on record', () => {
  it('draws the length the bridge builds each type at', () => {
    const mass = { type: 'masscomponent', id: 'm' } as unknown as ComponentNode;
    const chute = { type: 'parachute', id: 'p' } as unknown as ComponentNode;
    expect(internalExtent(mass, 0.012).length).toBe(KERNEL_DEFAULTS.masscomponent.length);
    expect(internalExtent(chute, 0.012).length).toBe(KERNEL_DEFAULTS.parachute.length);
  });
});

describe('rulerGraduations', () => {
  const base = { rulerStep: 0.1, rulerX0: 50, rulerX1: 1050, x0: 100, scale: 1000, vSpanM: 0.25, vTop: 40 };

  it('places length majors at the datum-relative step across the baseline', () => {
    const g = rulerGraduations({ ...base, showLen: true, showRad: false });
    expect(g.rulerMarks[0]).toBeCloseTo(0, 9);
    expect(g.rulerMarks[g.rulerMarks.length - 1]).toBeCloseTo(0.9, 9);
    expect(g.rulerMarks).toHaveLength(10);
    expect(g.rulerMinorMarks).toHaveLength(50);
    expect(g.rulerMinorMarks[0]).toBeCloseTo(-0.04, 9);
    expect(g.vTicks).toEqual([]);
    expect(g.vMinorTicks).toEqual([]);
  });

  it('places radial majors from vTop over the span, in viewBox px', () => {
    const g = rulerGraduations({ ...base, showLen: false, showRad: true });
    expect(g.vTicks.map((t) => t.label)).toEqual([0, 0.1, 0.2]);
    expect(g.vTicks.map((t) => t.y)).toEqual([40, 140, 240]);
    expect(g.vMinorTicks).toHaveLength(13);
    expect(g.rulerMarks).toEqual([]);
    expect(g.rulerMinorMarks).toEqual([]);
  });

  it('follows a zoom: radial majors from a datum above the window, at the zoomed scale', () => {
    const g = rulerGraduations({ ...base, scale: 2000, vy0: -110, showLen: false, showRad: true });
    expect(g.vTicks).toHaveLength(3);
    expect(g.vTicks[0]!.label).toBeCloseTo(0.1, 9);
    expect(g.vTicks[2]!.label).toBeCloseTo(0.3, 9);
    expect(g.vTicks[0]!.y).toBeCloseTo(90, 9);
    expect(g.vMinorTicks[0]).toBeCloseTo(0.08, 9);
  });

  it('returns four empty arrays when both rulers are off', () => {
    expect(rulerGraduations({ ...base, showLen: false, showRad: false })).toEqual({
      rulerMarks: [],
      vTicks: [],
      rulerMinorMarks: [],
      vMinorTicks: [],
    });
  });
});

describe('niceRulerStep', () => {
  it('picks a 1/2/2.5/5/10-times-power-of-ten step giving ~8 marks', () => {
    expect(niceRulerStep(1)).toBeCloseTo(0.2, 9);
    expect(niceRulerStep(0.4)).toBeCloseTo(0.05, 9);
    expect(niceRulerStep(8)).toBeCloseTo(1, 9);
    expect(niceRulerStep(0)).toBeGreaterThan(0);
  });
});

describe('snapNear', () => {
  it('snaps to the nearest target within eps, else returns the raw value', () => {
    expect(snapNear(0.11, [0.1, 0.2], 0.05)).toBeCloseTo(0.1, 9);
    expect(snapNear(0.15, [0.1, 0.2], 0.02)).toBeCloseTo(0.15, 9);
    expect(snapNear(0.3, [], 0.05)).toBe(0.3);
  });
});

describe('axialStart', () => {
  it('places a child by its position method within the parent span', () => {
    const pStart = 0;
    const pLen = 0.2;
    const cLen = 0.05;
    expect(axialStart(node({ position: { method: 'top', offset: 0 } }), cLen, pStart, pLen)).toBeCloseTo(0, 9);
    expect(axialStart(node({ position: { method: 'bottom', offset: 0 } }), cLen, pStart, pLen)).toBeCloseTo(0.15, 9);
    expect(axialStart(node({ position: { method: 'middle', offset: 0 } }), cLen, pStart, pLen)).toBeCloseTo(0.075, 9);
    expect(axialStart(node({}), cLen, pStart, pLen)).toBeCloseTo(0, 9);
  });
});

describe('calloutLayout', () => {
  it('returns null legs when a marker is absent', () => {
    const out = calloutLayout(null, null, 100, 20, 900, 400, null);
    expect(out.cg).toBeNull();
    expect(out.cp).toBeNull();
    expect(out.margin).toBeNull();
  });
  it('places the margin text inside the viewBox, clear of the CP label', () => {
    const w = 900;
    const out = calloutLayout(100, 300, 100, 20, w, 400, 'CG · 22.4 cm');
    expect(out.cg).not.toBeNull();
    expect(out.cp).not.toBeNull();
    expect(out.margin).not.toBeNull();
    expect(out.margin!.x).toBeGreaterThan(0);
    expect(out.margin!.x).toBeLessThan(w);
  });
});

describe('computeSchematicLayout', () => {
  const tree: RocketTree = {
    name: 't',
    components: [
      node({
        type: 'stage',
        children: [
          node({ type: 'nosecone', length: 0.1, aftRadius: 0.012 }),
          node({
            type: 'bodytube',
            length: 0.2,
            outerRadius: 0.012,
            children: [node({ type: 'trapezoidfinset', rootChord: 0.05, height: 0.03 })],
          }),
        ],
      }),
    ],
  } as unknown as RocketTree;
  const dims = { chPx: 480, cw: 900, maxHeight: 420 };

  it('flattens stages into a nose→tail chain and measures length/radius', () => {
    const out = computeSchematicLayout(tree, null, dims);
    expect(out.chain).toHaveLength(2); // stage unwrapped
    expect(out.totalLen).toBeCloseTo(0.3, 6);
    expect(out.maxR).toBeGreaterThanOrEqual(0.012);
  });
  it('vHalf includes the fin height, and scale/size are positive', () => {
    const out = computeSchematicLayout(tree, null, dims);
    expect(out.vHalf).toBeGreaterThan(out.maxR);
    expect(out.vHalf).toBeCloseTo(0.012 + 0.03, 6);
    expect(out.scale).toBeGreaterThan(0);
    expect(out.w).toBeGreaterThanOrEqual(320);
    expect(out.h).toBeGreaterThan(0);
  });
});

describe('profilePath', () => {
  it('emits a closed side-view outline (M … L … Z)', () => {
    const ctx = { scale: 1000, cy: 100, x0: 10 };
    const d = profilePath(ctx, node({ type: 'nosecone', shape: 'ogive' }), 0, 0.1, 0, 0.012, 100);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.trimEnd().endsWith('Z')).toBe(true);
    expect(d).toContain(' L ');
    expect(d).not.toContain('NaN');
  });
});

describe('computeSchematicLayout: tube fins on a narrow aft tube', () => {
  const stepped = {
    components: [
      node({
        type: 'stage',
        children: [
          node({ type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.03 }),
          node({ type: 'bodytube', id: 'fwd', length: 0.3, outerRadius: 0.03 }),
          node({ type: 'transition', id: 'tr', length: 0.05, foreRadius: 0.03, aftRadius: 0.0125 }),
          node({
            type: 'bodytube',
            id: 'aft',
            length: 0.2,
            outerRadius: 0.0125,
            children: [node({ type: 'tubefinset', id: 'tf', finCount: 6, length: 0.08 })],
          }),
        ],
      }),
    ],
  } as unknown as RocketTree;
  const dims = { chPx: 480, cw: 900, maxHeight: 420 };

  it('sizes them from the tube they ring, not the widest section forward of it', () => {
    const out = computeSchematicLayout(stepped, null, dims);
    expect(out.maxR).toBeCloseTo(0.03, 9);
    expect(out.vHalf).toBeCloseTo(0.055, 9);
  });

  it('does not reserve the reach they would have had on the 60 mm section', () => {
    const out = computeSchematicLayout(stepped, null, dims);
    expect(out.vHalf).toBeLessThan(0.09);
  });

  it('still honors an explicitly sized tube fin set', () => {
    const explicit = JSON.parse(JSON.stringify(stepped)) as RocketTree;
    const aft = explicit.components[0]!.children![3]!;
    (aft.children![0] as Record<string, unknown>)['outerRadius'] = 0.008;
    expect(computeSchematicLayout(explicit, null, dims).vHalf).toBeCloseTo(0.03 + 0.016, 9);
  });
});

describe('zoomAbout', () => {
  it('keeps the drawing point under the pointer fixed', () => {
    const z = { k: 2, x: 10, y: 20 };
    const px = 100,
      py = 60;
    const mx = (px - z.x) / z.k,
      my = (py - z.y) / z.k;
    const out = zoomAbout(z, px, py, 3);
    expect(out.k).toBe(3);
    expect(out.x + mx * out.k).toBeCloseTo(px);
    expect(out.y + my * out.k).toBeCloseTo(py);
  });
  it('snaps to identity at k = 1 so a fully zoomed-out view is un-panned', () => {
    expect(zoomAbout({ k: 2, x: 50, y: 50 }, 0, 0, 1)).toEqual({ k: 1, x: 0, y: 0 });
  });
  it('returns the same object when the scale does not change', () => {
    const z = { k: 2, x: 10, y: 20 };
    expect(zoomAbout(z, 5, 5, 2)).toBe(z);
  });
});

describe('zoomStep', () => {
  it('multiplies the scale by the factor', () => {
    expect(zoomStep({ k: 2, x: 0, y: 0 }, 0, 0, 1.5, MAX_ZOOM).k).toBe(3);
  });
  it('holds the scale at the ceiling', () => {
    expect(zoomStep({ k: 10, x: 0, y: 0 }, 0, 0, 1.5, MAX_ZOOM).k).toBe(MAX_ZOOM);
  });
  it('never zooms out past the fitted view', () => {
    expect(zoomStep({ k: 1.2, x: 4, y: 4 }, 0, 0, 0.5, MAX_ZOOM)).toEqual({ k: 1, x: 0, y: 0 });
  });
});

describe('hoverTagFor', () => {
  it('sits above the box, centered, when there is room', () => {
    const tag = hoverTagFor({ x0: 100, y0: 100, x1: 200, y1: 140 }, 'Body tube', 800, 400);
    expect(tag.x).toBe(150);
    expect(tag.y).toBe(87);
  });
  it('drops below the box when the top would leave the viewBox', () => {
    const tag = hoverTagFor({ x0: 100, y0: 10, x1: 200, y1: 40 }, 'Nose', 800, 400);
    expect(tag.y).toBe(53);
  });
  it('clamps a wide tag inside the viewBox width', () => {
    const tag = hoverTagFor({ x0: 0, y0: 100, x1: 10, y1: 140 }, 'A very long component name', 800, 400);
    expect(tag.x - tag.tw / 2).toBeGreaterThanOrEqual(0);
  });
});

describe('unionBox', () => {
  it('takes the outer extent of both', () => {
    expect(unionBox({ x0: 0, y0: 5, x1: 10, y1: 15 }, { x0: -2, y0: 8, x1: 8, y1: 20 })).toEqual({
      x0: -2,
      y0: 5,
      x1: 10,
      y1: 20,
    });
  });
});

describe('colorOf', () => {
  it('prefers the node color override', () => {
    expect(colorOf({ type: 'bodytube', color: '#123456' } as ComponentNode, '#000')).toBe('#123456');
  });
  it('falls back when the override is absent or not a string', () => {
    expect(colorOf({ type: 'bodytube' } as ComponentNode, '#000')).toBe('#000');
    expect(colorOf({ type: 'bodytube', color: 5 } as unknown as ComponentNode, '#000')).toBe('#000');
  });
});

describe('marginText', () => {
  const t = (k: string) => i18n.t(k);

  it('marks each band with its own glyph and the stats strip word', () => {
    expect(marginText(7, 12, t)!.text).toBe(`△ 7.00 cal · 12.0% (${t('schematic.overStable')})`);
    expect(marginText(2, 8, t)!.text).toBe(`✓ 2.00 cal · 8.0% (${t('stability.stable')})`);
    expect(marginText(0.5, 1, t)!.text).toBe(`⚠ 0.50 cal · 1.0% (${t('stability.marginal')})`);
    expect(marginText(-0.5, -1, t)!.text).toBe(`⚠ -0.50 cal · -1.0% (${t('stability.unstable')})`);
  });

  it('hands back the glyph and figures without the word, for the info card', () => {
    const m = marginText(2, 8, t)!;
    expect(`${m.glyph} ${m.figures}`).toBe('✓ 2.00 cal · 8.0%');
  });

  it('writes the percentage as the report does, in the reader language', async () => {
    await i18n.changeLanguage('de');
    try {
      expect(marginText(2, 12.3, t)!.figures).toBe(`2,00 ${t('stability.caliber')} · ${fmtPercent(12.3, 1)}`);
      expect(fmtPercent(12.3, 1)).toBe('12,3 %');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('prints nothing without a finite margin and percentage', () => {
    expect(marginText(Number.NaN, 8, t)).toBeNull();
    expect(marginText(2, null, t)).toBeNull();
  });
});

describe('figureToken', () => {
  it('gives each part type the ink it is drawn in', () => {
    expect(figureToken('bodytube')).toBe('sch-shell-light');
    expect(figureToken('nosecone')).toBe('sch-shell');
    expect(figureToken('transition')).toBe('sch-shell');
    expect(figureToken('trapezoidfinset')).toBe('sch-part');
    expect(figureToken('launchlug')).toBe('sch-part-light');
    expect(figureToken('parachute')).toBe('sch-parachute');
    expect(figureToken('innertube')).toBe('sch-innertube');
  });

  it('falls back to the plain ink for a type with none of its own', () => {
    expect(figureToken('stage')).toBe('sch-ink');
  });
});
