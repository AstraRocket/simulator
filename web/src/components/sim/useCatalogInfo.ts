import { catalogInfo } from '../../services/app/remoteData';
import { useAsyncLoad } from '../common/useAsyncLoad';

export function useCatalogInfo() {
  return useAsyncLoad(() => catalogInfo('motors'), 'motorsInfo').data;
}
