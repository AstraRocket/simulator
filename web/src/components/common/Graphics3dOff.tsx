import { useTranslation } from 'react-i18next';
import { COMPATIBILITY_URL, GRAPHICS_OFF_KEY, type Graphics3dOff } from '../../services/app/graphics';

/** Stands where a 3D view would be when the startup check turned 3D off. */
export function Graphics3dOffNotice({ reason }: { reason: Graphics3dOff }) {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center p-4">
      <div className="max-w-sm text-center text-sm text-ink-muted">
        <p>{t(GRAPHICS_OFF_KEY[reason])}</p>
        <p className="mt-2">
          <a
            href={COMPATIBILITY_URL}
            target="_blank"
            rel="noreferrer"
            className="text-accent-400 underline hover:text-accent-300"
          >
            {t('graphics.change')}
          </a>
        </p>
      </div>
    </div>
  );
}
