import { useTranslation } from 'react-i18next';
import { DESIGN_TYPES } from '../../engine/openRocketEngine';

// Keeps an unrecognized imported design-type token selectable so saving can't drop it.
export function DesignTypeOptions({ current }: { current: string }) {
  const { t } = useTranslation();
  const known = (DESIGN_TYPES as readonly string[]).includes(current);
  return (
    <>
      {(known ? DESIGN_TYPES : [current, ...DESIGN_TYPES]).map((tk) => (
        <option key={tk} value={tk}>
          {tk === current && !known ? tk : t(`config.type_${tk}`)}
        </option>
      ))}
    </>
  );
}
