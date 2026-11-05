import type { ComponentNode, ComponentType } from '../../engine/openRocketEngine';
import { hexOf, packRgb, parseHexColor, rgbChannels } from './colorHex';
import { colorForType, DEFAULT_PART_COLORS, type PartPalette } from './partColors';
import { EXTERNAL_COMPONENT_TYPES } from '../../tree/componentKinds';

/** Separate from the figure color (`color`), which the 2D views draw. */
export interface PartAppearance {
  paint: string;
  /** 0-255, as `ORColor` stores it, not 0-1. */
  alpha: number;
  /** 0-1, clamped as the `Appearance` constructor clamps it. */
  shine: number;
  /** Unused here, kept so a save round-trips it. */
  opacityAffectsTexture?: boolean;
}

export interface Look {
  color: string;
  shine: number;
  /** 0-1. */
  opacity: number;
}

/** The parts that implement `InsideColorComponent`. */
export const INSIDE_COLOR_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  'bodytube',
  'innertube',
  'nosecone',
  'transition',
  'launchlug',
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'tubefinset',
]);

/** A fin set's two sides are left and right, not outside and inside (`AppearancePanel`). */
export const SIDED_TYPES: ReadonlySet<ComponentType> = new Set<ComponentType>([
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
]);

/** Desktop `DefaultAppearance`. */
const DEFAULT_SHINE: Partial<Record<ComponentType, number>> = {
  bodytube: 0.3,
  innertube: 0.1,
  tubecoupler: 0.1,
  tubefinset: 0.1,
  launchlug: 0.3,
  nosecone: 0.3,
  transition: 0.3,
  railbutton: 0.3,
};

/** Desktop `AppearanceBuilder.resetToDefaults`. */
export const BUILDER_DEFAULT: PartAppearance = { paint: '#bbbbbb', alpha: 255, shine: 0.3 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function readAppearance(v: unknown): PartAppearance | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const rgb = parseHexColor(o['paint']);
  if (rgb === null) return undefined;
  const alpha = typeof o['alpha'] === 'number' && Number.isFinite(o['alpha']) ? o['alpha'] : 255;
  const shine = typeof o['shine'] === 'number' && Number.isFinite(o['shine']) ? o['shine'] : 0;
  return {
    paint: hexOf(rgb),
    alpha: Math.round(Math.min(255, Math.max(0, alpha))),
    shine: clamp01(shine),
    ...(o['opacityAffectsTexture'] === true ? { opacityAffectsTexture: true } : {}),
  };
}

export function defaultAppearance(type: ComponentType, palette: PartPalette = DEFAULT_PART_COLORS): PartAppearance {
  return { paint: colorForType(type, palette), alpha: 255, shine: DEFAULT_SHINE[type] ?? 0 };
}

export function outsideAppearance(node: ComponentNode, palette?: PartPalette): PartAppearance {
  return readAppearance(node['appearance']) ?? defaultAppearance(node.type, palette);
}

function insideAppearance(node: ComponentNode, palette?: PartPalette): PartAppearance {
  return readAppearance(node['insideAppearance']) ?? defaultAppearance(node.type, palette);
}

export const opacityOf = (a: PartAppearance): number => a.alpha / 255;

/** Truncated, not rounded, as `AppearanceBuilder.setOpacity` does. */
export const alphaOf = (opacity: number): number => Math.trunc(clamp01(opacity) * 255);

const lookOf = (a: PartAppearance): Look => ({ color: a.paint, shine: a.shine, opacity: opacityOf(a) });

/** As desktop `RealisticRenderer.renderComponent` picks them. */
export function partLooks(node: ComponentNode, palette?: PartPalette): { outside: Look; inside: Look; edges: Look } {
  const outside = outsideAppearance(node, palette);
  if (!INSIDE_COLOR_TYPES.has(node.type)) {
    const l = lookOf(outside);
    return { outside: l, inside: l, edges: l };
  }
  const inside = node['separateInsideOutside'] === true ? insideAppearance(node, palette) : outside;
  return {
    outside: lookOf(outside),
    inside: lookOf(inside),
    edges: lookOf(node['edgesSameAsInside'] === true ? inside : outside),
  };
}

const EXTERNAL_TYPES = EXTERNAL_COMPONENT_TYPES;

/** Desktop `FigureRenderer.getShine`, out of OpenGL's 128. */
const FIGURE_SHININESS: Partial<Record<string, number>> = {
  rough: 10,
  unfinished: 30,
  normal: 40,
  smooth: 80,
  polished: 128,
};

const scaled = (hex: string, k: number): string => {
  const [r, g, b] = rgbChannels(parseHexColor(hex) ?? 0);
  const dim = (c: number) => Math.round(c * k);
  return hexOf(packRgb(dim(r), dim(g), dim(b)));
};

/** Desktop `FigureRenderer.renderComponent`. */
export function figureLooks(node: ComponentNode, palette?: PartPalette): { outside: Look; inside: Look; edges: Look } {
  const rgb = parseHexColor(node['color']);
  const color = rgb === null ? colorForType(node.type, palette) : hexOf(rgb);
  const finish = typeof node['finish'] === 'string' ? node['finish'] : 'normal';
  const shininess = EXTERNAL_TYPES.has(node.type) ? (FIGURE_SHININESS[finish] ?? 100) : 20;
  const outside = { color, shine: shininess / 128, opacity: 1 };
  return { outside, inside: { color: scaled(color, 0.7), shine: 0, opacity: 1 }, edges: outside };
}
