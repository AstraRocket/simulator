import { useTranslation } from 'react-i18next';
import type { PartMeta } from '../../services/parts/customParts';
import { StackedField } from '../common/StackedField';

export function PartMetaFields({
  idPrefix,
  meta,
  onChange,
  onEnter,
  autoFocus = false,
}: {
  idPrefix: string;
  meta: PartMeta;
  onChange: (patch: Partial<PartMeta>) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const onKeyDown = onEnter ? (e: { key: string }) => e.key === 'Enter' && onEnter() : undefined;
  return (
    <>
      <StackedField
        id={`${idPrefix}-part-no`}
        label={t('picker.savePartNo')}
        autoFocus={autoFocus}
        value={meta.partNo}
        onChange={(e) => onChange({ partNo: e.target.value })}
        onKeyDown={onKeyDown}
        maxLength={80}
      />
      <StackedField
        id={`${idPrefix}-part-mfr`}
        label={t('picker.saveMfr')}
        value={meta.mfr}
        onChange={(e) => onChange({ mfr: e.target.value })}
        onKeyDown={onKeyDown}
        maxLength={80}
      />
      <StackedField
        id={`${idPrefix}-part-desc`}
        label={t('picker.saveDesc')}
        value={meta.desc}
        onChange={(e) => onChange({ desc: e.target.value })}
        onKeyDown={onKeyDown}
        maxLength={200}
        placeholder={t('picker.saveDescHint')}
      />
    </>
  );
}
