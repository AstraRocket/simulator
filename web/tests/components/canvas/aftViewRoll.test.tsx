// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { AftView } from '../../../src/components/canvas/AftView';
import { buildSchematicShapes } from '../../../src/components/canvas/schematicShapes';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { ENGLISH_LABELS } from '../../testing/schematicLabels';

// Desktop's RocketFigure applies one `rotate_x(rotation)` to side and back views alike.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LUG_ANGLE = Math.PI / 2;
const ROLL = Math.PI / 2;
const R = 0.02;

const lug = { type: 'launchlug', id: 'lug', name: 'Lug', angleOffset: LUG_ANGLE } as ComponentNode;
const body = { type: 'bodytube', id: 'body', outerRadius: R, length: 0.3, thickness: 0.001, children: [lug] };
const tree = { name: 'T', components: [{ type: 'stage', id: 'stage', children: [body] }] } as unknown as RocketTree;

const desktopUp = Math.cos(LUG_ANGLE + ROLL);

// Up positive, after the drawing group's transform.
function aftUp(roll: number): number {
  const { container } = renderWithProviders(<AftView tree={tree} roll={roll} />);
  const circle = [...container.querySelectorAll('circle')].find((c) => c.querySelector('title')?.textContent === 'Lug');
  expect(circle).toBeDefined();
  const cx = Number(circle!.getAttribute('cx'));
  const cy = Number(circle!.getAttribute('cy'));
  const tf = circle!.closest('g')!.getAttribute('transform') ?? '';
  const deg = Number(/rotate\(([-\d.e]+)\)/.exec(tf)?.[1] ?? 0);
  const a = (deg * Math.PI) / 180;
  // SVG rotate(a): y' = x sin a + y cos a, with y growing down.
  const yDown = cx * Math.sin(a) + cy * Math.cos(a);
  return -yDown / Math.hypot(cx, cy);
}

// Up positive, relative to the tube axis.
function sideUp(roll: number): number {
  const baseY = 200;
  const { shapes } = buildSchematicShapes({
    chain: [body as unknown as ComponentNode],
    ctx: { scale: 1000, cy: baseY, x0: 0 },
    scale: 1000,
    w: 800,
    h: 400,
    roll,
    uid: 't',
    setHoverId: () => {},
    ...ENGLISH_LABELS,
  });
  const rect = shapes
    .filter((n): n is ReactElement<Record<string, unknown>> => isValidElement(n) && n.type === 'rect')
    .find((r) => Number(r.props['width']) < 300);
  expect(rect).toBeDefined();
  const mid = Number(rect!.props['y']) + Number(rect!.props['height']) / 2;
  return baseY - mid;
}

describe('the aft view rolls the same way as the side view', () => {
  it('puts a 90 degree lug rolled 90 degrees below the axis, as desktop does', () => {
    expect(desktopUp).toBeCloseTo(-1, 9);
    expect(sideUp(ROLL)).toBeLessThan(0);
    expect(aftUp(ROLL)).toBeCloseTo(desktopUp, 6);
  });

  it('agrees with desktop at a roll that is not a quarter turn', () => {
    const roll = Math.PI / 6;
    expect(aftUp(roll)).toBeCloseTo(Math.cos(LUG_ANGLE + roll), 6);
  });

  it('turns the drawing clockwise on a drag to the right', () => {
    const onRoll = vi.fn();
    const { container } = renderWithProviders(<AftView tree={tree} onRoll={onRoll} />);
    const svg = container.querySelector('svg')!;
    fireEvent.pointerDown(svg, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 130, pointerId: 1 });
    expect(onRoll).toHaveBeenCalledTimes(1);
    const delta = onRoll.mock.calls[0]![0] as number;
    // The group turns by rotate(-roll), so clockwise is a negative roll delta.
    expect(delta).toBeLessThan(0);
  });
});
