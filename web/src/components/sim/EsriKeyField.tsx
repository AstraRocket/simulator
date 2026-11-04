import { UserKeyField } from '../common/UserKeyField';
import { esriKeyStore } from '../../services/map/esriKey';

export function EsriKeyField() {
  return (
    <UserKeyField
      store={esriKeyStore}
      label="map.keyLabel"
      placeholder="map.keyPlaceholder"
      note="map.keyNote"
      notSaved="map.keyNotSaved"
    />
  );
}
