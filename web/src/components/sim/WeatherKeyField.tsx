import { UserKeyField } from '../common/UserKeyField';
import { weatherKeyStore } from '../../services/weather/weatherKey';

export function WeatherKeyField() {
  return (
    <UserKeyField
      store={weatherKeyStore}
      label="weather.keyLabel"
      placeholder="weather.keyPlaceholder"
      note="weather.keyNote"
      notSaved="weather.keyNotSaved"
    />
  );
}
