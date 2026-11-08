import type { ComponentNode } from '../../engine/openRocketEngine';
import { num } from '../../tree/nodeProps';
import { degToRad } from '../../prefs/units';

// Clamps mirror the kernel's so an edge-case edit cannot push `Infinity` into the mass, mesh or `.ork`.

/** 89 degrees, not 90, so the tangent is finite (`TrapezoidFinSet.MAX_SWEEP_ANGLE`). */
export const MAX_SWEEP_ANGLE = degToRad(89);

const MAX_MASS = 1_000_000;

const MIN_ASPECT = 0.01;

const DEGENERATE_ASPECT = 1000;

export type DerivedName = 'sweepAngle' | 'stripArea' | 'stripAspect' | 'massDensity' | 'clusterSeparation';

export type Derived = {
  quantity?: 'angle' | 'area' | 'density' | 'length';
  /** SI. `min` defaults to 0. */
  min?: (node: ComponentNode) => number;
  max?: (node: ComponentNode) => number;
  /** SI. */
  read: (node: ComponentNode) => number;
  /** Empty patch to refuse the value. */
  write: (node: ComponentNode, v: number) => Partial<ComponentNode>;
};

const packedVolume = (node: ComponentNode): number => Math.PI * num(node, 'radius') ** 2 * num(node, 'length');

export const DERIVED: Record<DerivedName, Derived> = {
  // Negative is a forward sweep. Zero height reads as a right angle, as upstream does.
  sweepAngle: {
    quantity: 'angle',
    min: () => -MAX_SWEEP_ANGLE,
    max: () => MAX_SWEEP_ANGLE,
    read: (node) => {
      const height = num(node, 'height');
      const sweep = num(node, 'sweep');
      if (height === 0) return sweep === 0 ? 0 : Math.sign(sweep) * (Math.PI / 2);
      return Math.atan2(sweep, height);
    },
    write: (node, v) => {
      const height = num(node, 'height');
      const sweep = Math.tan(Math.max(-MAX_SWEEP_ANGLE, Math.min(MAX_SWEEP_ANGLE, v))) * height;
      return Number.isFinite(sweep) ? { sweep } : {};
    },
  },

  stripArea: {
    quantity: 'area',
    read: (node) => num(node, 'stripWidth') * num(node, 'stripLength'),
    write: (node, v) => {
      const ratio = Math.max(DERIVED.stripAspect.read(node), MIN_ASPECT);
      const stripWidth = Math.sqrt(Math.max(0, v) / ratio);
      return Number.isFinite(stripWidth) ? { stripWidth, stripLength: ratio * stripWidth } : {};
    },
  },

  stripAspect: {
    read: (node) => {
      const w = num(node, 'stripWidth');
      return w > 0.0001 ? num(node, 'stripLength') / w : DEGENERATE_ASPECT;
    },
    write: (node, v) => {
      const ratio = Math.max(v, MIN_ASPECT);
      const stripWidth = Math.sqrt(DERIVED.stripArea.read(node) / ratio);
      return Number.isFinite(stripWidth) ? { stripWidth, stripLength: ratio * stripWidth } : {};
    },
  },

  // Gap between tube walls; negative (overlapping) is legal.
  clusterSeparation: {
    quantity: 'length',
    min: (node) => -num(node, 'outerRadius') * 2,
    read: (node) => (num(node, 'clusterScale', 1) - 1) * num(node, 'outerRadius') * 2,
    write: (node, v) => {
      const d = num(node, 'outerRadius') * 2;
      if (!(d > 0)) return {};
      // `setClusterScale` floors at 0: concentric rather than inside out.
      return { clusterScale: Math.max(0, v / d + 1) };
    },
  },

  massDensity: {
    quantity: 'density',
    read: (node) => {
      const d = num(node, 'mass') / packedVolume(node);
      return Number.isFinite(d) ? d : 0;
    },
    write: (node, v) => {
      const mass = v * packedVolume(node);
      if (!Number.isFinite(mass)) return {};
      return { mass: Math.max(0, Math.min(MAX_MASS, mass)) };
    },
  },
};
