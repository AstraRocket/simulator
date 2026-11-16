import { useTranslation } from 'react-i18next';
import type { AltitudeReference, DistanceUnit } from '../../services/exports/flightPathExport';
import { CardGroup } from '../common/CardGroup';
import { SelectRow } from '../common/SelectRow';

const UNITS: DistanceUnit[] = ['m', 'ft', 'km', 'mi'];

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <CardGroup title={title} fill="raised">
      {children}
    </CardGroup>
  );
}

export function AltitudeRefSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AltitudeReference;
  onChange: (v: AltitudeReference) => void;
}) {
  const { t } = useTranslation();
  return (
    <SelectRow label={label} value={value} onChange={onChange} width="w-40">
      <option value="automatic">{t('pathExport.altRef.automatic')}</option>
      <option value="ground">{t('pathExport.altRef.ground')}</option>
      <option value="sealevel">{t('pathExport.altRef.sealevel')}</option>
      <option value="clamped">{t('pathExport.altRef.clamped')}</option>
    </SelectRow>
  );
}

export function UnitRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DistanceUnit;
  onChange: (u: DistanceUnit) => void;
}) {
  return (
    <SelectRow label={label} value={value} onChange={onChange} width="w-24">
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
    </SelectRow>
  );
}
