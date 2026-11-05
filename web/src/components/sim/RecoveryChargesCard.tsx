import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { unitScope } from '../../prefs/units';
import { NO_VALUE } from '../../i18n/noValue';
import { stagePrefixed } from '../../i18n/format';
import { useWorkspaceStore } from '../../state/store';
import { chargeRows } from '../../services/flight/recoveryCharges';
import { useScopedUnit } from '../common/UnitChip';
import { CardGroup } from '../common/CardGroup';

export function RecoveryChargesCard() {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const rows = useMemo(() => chargeRows(tree), [tree]);
  const mass = useScopedUnit(unitScope('ejection', 'saved'), 'mass');
  if (!rows.length) return null;

  const grams = (kg: number | null) => (kg == null ? NO_VALUE : mass.fmt(kg, 2));
  return (
    <CardGroup title={t('charges.title')}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-ink-muted">
            <th scope="col" className="py-1 font-medium">
              {t('charges.role')}
            </th>
            <th scope="col" className="py-1 font-medium">
              {t('charges.bay')}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {t('charges.primary')} {mass.chip(t('charges.primary'))}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {t('charges.backup')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.role}:${r.tubeId}`} className="border-t border-line/5">
              <th scope="row" className="py-1 text-left font-medium text-ink">
                {t(`charges.role_${r.role}`)}
              </th>
              <td className="py-1 text-ink-soft">{stagePrefixed(t, r.stageName, r.tubeName || NO_VALUE)}</td>
              <td className="py-1 text-right tabular-nums text-ink">{grams(r.primaryKg)}</td>
              <td className="py-1 text-right tabular-nums text-ink">{grams(r.backupKg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardGroup>
  );
}
