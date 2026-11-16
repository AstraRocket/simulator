import { catalogInfo, type CatalogName } from '../../services/app/remoteData';
import { useAsyncLoad } from '../common/useAsyncLoad';

export function useCatalogInfo(name: CatalogName = 'motors') {
  return useAsyncLoad(async () => catalogInfo(name), `${name}Info`).data;
}
