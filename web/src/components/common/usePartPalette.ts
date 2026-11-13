import { useMemo } from 'react';
import { mergePalette, type PartPalette } from '../../services/design/partColors';
import { useSettings } from '../../state/useSettings';

/** The default part colors with the user's overrides on top. */
export function usePartPalette(): PartPalette {
  const { settings } = useSettings();
  return useMemo(() => mergePalette(settings.partColors), [settings.partColors]);
}
