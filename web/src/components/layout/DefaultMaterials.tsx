import { useTranslation } from 'react-i18next';
import { MaterialPicker } from '../design/MaterialPicker';
import { MATERIAL_SLOTS, defaultMaterialKey } from '../../services/design/materialSlots';
import type { Settings } from '../../services/storage/settings';
import { withKey } from '../../services/app/objectKeys';

// Applied at creation only, as desktop's component constructors do; existing parts are untouched.

export function DefaultMaterials({
  defaults,
  onChange,
}: {
  defaults: Settings['defaultMaterials'];
  onChange: (next: Settings['defaultMaterials']) => void;
}) {
  const { t } = useTranslation();

  const set = (key: string, name: string | undefined, density: number, group?: string, shearModulus?: number) => {
    const chosen =
      !name || !(density > 0)
        ? null
        : { name, density, ...(group ? { group } : {}), ...(shearModulus ? { shearModulus } : {}) };
    onChange(withKey(defaults, key, chosen));
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-ink-faint">{t('settings.materialsNote')}</p>
      {MATERIAL_SLOTS.map(({ part, material }) => {
        const key = defaultMaterialKey(part, material);
        return (
          <MaterialPicker
            key={key}
            type={material}
            label={t(`settings.materialSlot.${material === 'bulk' ? part : `${part}_${material}`}`, {
              defaultValue: t(`part.${part}`, { defaultValue: part }),
            })}
            unsetLabel={t('settings.materialNoDefault')}
            design={false}
            value={defaults[key]?.name}
            density={defaults[key]?.density}
            onChange={(name, density, group, shearModulus) => set(key, name, density, group, shearModulus)}
          />
        );
      })}
    </div>
  );
}
