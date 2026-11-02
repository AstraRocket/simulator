import { useSyncExternalStore } from 'react';
import type { ComponentNode } from '../engine/openRocketEngine';
import { changeSignal } from '../services/app/changeSignal';
import { FIN_MATERIALS, finStockFor, type FinMaterialKey } from '../services/flight/finFlutter';

/**
 * The fin stock each fin set's flutter check uses, chosen in its editor's Fin
 * flutter dialog and read by the flight warnings too, so the two agree.
 *
 * A fin set nobody has chosen for takes the stock its material is
 * (`finStockFor`), or none. Kept by node id for the page's life and not saved
 * with the design: desktop's file has no place for it.
 */

export type FinStock = FinMaterialKey | 'custom';

export interface FinStockChoice {
  stock: FinStock;
  /** Null until a modulus is typed for a stock the table has no figure for. */
  shearPa: number | null;
}

/** The shear modulus a fin stock stands for. */
export function stockModulus(key: FinMaterialKey): number {
  return FIN_MATERIALS.find((m) => m.key === key)!.shearModulusPa;
}

export type FinStockChoices = ReadonlyMap<string, FinStockChoice>;

/** Replaced, never changed in place, so a reader holding one sees it as it was. */
let chosen: FinStockChoices = new Map();
const signal = changeSignal();

/** The stock a fin set's flutter is checked with, from `choices` or its material. */
export function finStockChoice(node: ComponentNode, choices: FinStockChoices = chosen): FinStockChoice {
  const held = node.id ? choices.get(node.id) : undefined;
  if (held) return held;
  const matched = finStockFor(node.materialName);
  return matched ? { stock: matched, shearPa: stockModulus(matched) } : { stock: 'custom', shearPa: null };
}

/** Keeps a fin set's choice and tells every reader. */
export function chooseFinStock(nodeId: string, choice: FinStockChoice): void {
  chosen = new Map(chosen).set(nodeId, choice);
  signal.bump();
}

/** Forgets every choice, so each test starts from the materials'. */
export function forgetFinStockChoices(): void {
  chosen = new Map();
  signal.bump();
}

/** Every choice made so far, re-rendering the caller on each new one. */
export function useFinStockChoices(): FinStockChoices {
  return useSyncExternalStore(signal.subscribe, () => chosen);
}
