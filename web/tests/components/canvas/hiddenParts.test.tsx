// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { buildSchematicShapes } from '../../../src/components/canvas/schematicShapes';
import { buildAftScene } from '../../../src/components/canvas/aftScene';
import { SchematicGrid } from '../../../src/components/canvas/SchematicRulers';
import { ComponentTree } from '../../../src/components/design/ComponentTree';
import type { PartVisibility } from '../../../src/components/design/PartVisibilityToggle';
import { schematicSvg } from '../../../src/services/exports/schematicExport';
import { hiddenPartIds } from '../../../src/tree/partVisibility';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { ENGLISH_LABELS } from '../../testing/schematicLabels';

const lug = { id: 'lug', type: 'launchlug', outerRadius: 0.005, length: 0.03 } as ComponentNode;
const front = { id: 'front', type: 'bodytube', name: 'Front', outerRadius: 0.02, length: 0.3, children: [lug] };
const rear = { id: 'rear', type: 'bodytube', name: 'Rear', outerRadius: 0.02, length: 0.2 };
const chain = [front, rear] as ComponentNode[];
const stage = { id: 'st', type: 'stage', name: 'Stage', children: chain } as ComponentNode;

const shapesFor = (hiddenIds?: ReadonlySet<string>) =>
  buildSchematicShapes({
    chain,
    ctx: { scale: 1000, cy: 200, x0: 0 },
    scale: 1000,
    w: 800,
    h: 400,
    roll: 0,
    uid: 't',
    hiddenIds,
    setHoverId: () => {},
    ...ENGLISH_LABELS,
  });

const rects = (nodes: ReactNode[]) =>
  nodes.filter((n): n is ReactElement<{ x: number; width: number }> => isValidElement(n) && n.type === 'rect');

describe('hiddenPartIds', () => {
  it('takes in everything inside a hidden part', () => {
    expect([...hiddenPartIds([stage], new Set(['front']))].sort()).toEqual(['front', 'lug']);
  });
  it('takes in a whole stage', () => {
    expect([...hiddenPartIds([stage], new Set(['st']))].sort()).toEqual(['front', 'lug', 'rear', 'st']);
  });
  it('ignores an id no longer in the design', () => {
    expect(hiddenPartIds([stage], new Set(['gone'])).size).toBe(0);
  });
});

describe('side view', () => {
  it('leaves a hidden part out and keeps the next part where it was', () => {
    const shown = rects(shapesFor().shapes);
    expect(shown.map((r) => r.props.x)).toEqual([0, 135, 300]);
    const without = shapesFor(new Set(['front', 'lug']));
    expect(rects(without.shapes).map((r) => r.props.x)).toEqual([300]);
    expect(without.extents.has('front')).toBe(false);
    expect(without.extents.has('lug')).toBe(false);
  });
});

describe('aft view', () => {
  const t = ((k: string) => k) as unknown as TFunction;
  it('leaves hidden parts out', () => {
    const all = buildAftScene([stage], undefined, t);
    expect(all.hulls).toHaveLength(2);
    const some = buildAftScene([stage], undefined, t, new Set(['front', 'lug']));
    expect(some.hulls).toHaveLength(1);
    expect(some.outer.length).toBeLessThan(all.outer.length);
  });
});

describe('grid', () => {
  const frame = {
    rulers: { top: true, bottom: false, left: true, right: false },
    w: 800,
    h: 400,
    zoom: { k: 1, x: 0, y: 0 },
    ctxX0: 60,
    viewScale: 1000,
    rTop: 20,
    rBot: 4,
  };

  const grid = (zoom = frame.zoom) => {
    const { container } = renderWithProviders(
      <svg>
        <SchematicGrid {...frame} zoom={zoom} />
      </svg>,
    );
    return container.querySelector('[data-schematic-grid]')?.getAttribute('d') ?? '';
  };

  it('draws both directions, and follows the pan', () => {
    const d = grid();
    expect(d).toMatch(/M[\d.]+ [\d.]+V/);
    expect(d).toMatch(/M[\d.]+ [\d.]+H/);
    expect(grid({ k: 1, x: 7, y: 0 })).not.toBe(d);
  });

  it('is not a direct g and does not reach an export', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<path data-schematic-grid="" d="M0 0H9"/><g transform="translate(5 5) scale(2)"><rect/></g>';
    const out = schematicSvg(svg, 1000, 100, 100, { name: 'R' } as never);
    expect(out).not.toContain('data-schematic-grid');
    expect(out).toContain('translate(0 0) scale(1)');
  });
});

describe('tree eye button', () => {
  const tree = { name: 'R', components: [stage] } as unknown as RocketTree;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;

  const show = (hidden: string[]) => {
    const set = new Set(hidden);
    const visibility: PartVisibility = {
      hidden: set,
      shownHidden: hiddenPartIds([stage], set),
      onToggle: vi.fn(),
      onShowAll: vi.fn(),
    };
    const onSelect = vi.fn();
    renderWithProviders(<ComponentTree tree={tree} selectedId={null} onSelect={onSelect} visibility={visibility} />);
    return { visibility, onSelect };
  };

  it('toggles the part without selecting the row', () => {
    const { visibility, onSelect } = show([]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide in the views' })[1]!);
    expect(visibility.onToggle).toHaveBeenCalledWith('front');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('locks a child hidden by its parent, and offers Show all', () => {
    const { visibility } = show(['front']);
    const pressed = screen.getByRole('button', { name: 'Show in the views' });
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    const hideButtons = screen.getAllByRole('button', { name: 'Hide in the views' }) as HTMLButtonElement[];
    // Stage and Rear; the lug under Front says why it is locked instead of offering to hide.
    expect(hideButtons.map((b) => b.disabled)).toEqual([false, false]);
    const lug = screen.getByRole('button', { name: 'Hidden in the views with the part it is in' }) as HTMLButtonElement;
    expect(lug.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(visibility.onShowAll).toHaveBeenCalled();
  });
});
