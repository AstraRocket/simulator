import { useEffect, useState } from 'react';
import { type CatalogProgress, subscribeCatalogProgress } from '../../services/app/remoteData';

export function useCatalogProgress(name: string): CatalogProgress | null {
  const [progress, setProgress] = useState<CatalogProgress | null>(null);
  useEffect(() => subscribeCatalogProgress(name, setProgress), [name]);
  return progress;
}
