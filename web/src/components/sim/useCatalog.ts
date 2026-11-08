import { useState } from 'react';
import { loadCatalog, type CatalogMotor } from '../../services/motors/motorDb';
import { useAsyncLoad } from '../common/useAsyncLoad';

/** No `open` guard: callers must mount only while open, or the catalog fetches on app start. */
export function useCatalog({ onLoaded }: { onLoaded?: (catalog: CatalogMotor[]) => void } = {}) {
  const [catalog, setCatalog] = useState<CatalogMotor[]>([]);
  const { loading, error, retry } = useAsyncLoad(loadCatalog, 'motors', {
    onLoaded: (c) => {
      setCatalog(c);
      onLoaded?.(c);
    },
  });
  return { catalog, setCatalog, loading, error, retry };
}
