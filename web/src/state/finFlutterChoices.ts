import { useSyncExternalStore } from 'react';
import type { ComponentNode } from '../engine/openRocketEngine';
import { changeSignal } from '../services/app/changeSignal';
import { FIN_MATERIALS, finStockFor, type FinMaterialKey } from '../services/flight/finFlutter';

// Not saved: desktop's file has no place for it.

export type FinStock = FinMaterialKey | 'custom';

export interface FinStockChoice {
  stock: FinStock;
  shearPa: number | null;
}

export function stockModulus(key: FinMaterialKey): number {
  return FIN_MATERIALS.find((m) => m.key === key)!.shearModulusPa;
}

export type FinStockChoices = ReadonlyMap<string, FinStockChoice>;

// Replaced, never mutated: useSyncExternalStore compares by identity.
let chosen: FinStockChoices = new Map();
const signal = changeSignal();

export function finStockChoice(node: ComponentNode, choices: FinStockChoices = chosen): FinStockChoice {
  const held = node.id ? choices.get(node.id) : undefined;
  if (held) return held;
  const matched = finStockFor(node.materialName);
  return matched ? { stock: matched, shearPa: stockModulus(matched) } : { stock: 'custom', shearPa: null };
}

export function chooseFinStock(nodeId: string, choice: FinStockChoice): void {
  chosen = new Map(chosen).set(nodeId, choice);
  signal.bump();
}

export function forgetFinStockChoices(): void {
  chosen = new Map();
  signal.bump();
}

export function useFinStockChoices(): FinStockChoices {
  return useSyncExternalStore(signal.subscribe, () => chosen);
}
