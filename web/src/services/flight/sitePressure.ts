// The kernel flies site pressure; forecasts quote sea-level pressure.

// Pa.
export const SEA_LEVEL_MARGIN_PA = 5_000;

export function seaLevelExcessPa(typedPa: number, standardPa: number): number | null {
  const excess = typedPa - standardPa;
  return excess > SEA_LEVEL_MARGIN_PA ? excess : null;
}
