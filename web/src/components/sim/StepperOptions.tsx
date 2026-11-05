import { useTranslation } from 'react-i18next';
import { SIM_STEPPERS } from '../../services/flight/simulations';
import { STEPPER_LABELS } from './simOptionFields';

export function StepperOptions() {
  const { t } = useTranslation();
  return SIM_STEPPERS.map((s) => (
    <option key={s} value={s}>
      {t(STEPPER_LABELS[s])}
    </option>
  ));
}
