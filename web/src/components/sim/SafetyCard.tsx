import { useLauncherT } from '../common/useLauncher';
import { useSettings } from '../../state/SettingsProvider';
import { confirm } from '../../state/confirmStore';
import { useHelpStore } from '../../state/helpStore';
import { WARNING_TONE } from './warningTone';

const BULLET = 'flex gap-2';

export function SafetyCard() {
  const t = useLauncherT();
  const openHelp = useHelpStore((s) => s.openHelp);
  const { settings, update } = useSettings();
  const open = settings.showSafetyCard;
  const toggle = async () => {
    if (!open) {
      update({ showSafetyCard: true });
      return;
    }
    const ok = await confirm({
      title: t('sim.safetyAckTitle'),
      message: t('sim.safetyAckBody'),
      confirmLabel: t('sim.safetyAckConfirm'),
    });
    if (ok) update({ showSafetyCard: false });
  };
  return (
    <section aria-label={t('sim.safetyTitle')} className={`rounded-xl p-3 ring-1 ${WARNING_TONE.NORMAL}`}>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className={`flex w-full items-center gap-1.5 text-left text-[10px] font-semibold uppercase tracking-wide ${open ? 'mb-2' : ''}`}
      >
        <span aria-hidden>⚠</span>
        {t('sim.safetyTitle')}
        <span aria-hidden className={`ml-auto transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {!open ? null : (
        <>
          <p className="text-xs font-semibold leading-snug">{t('sim.safetyLead')}</p>
          {/* Spelled out, not mapped, so keys.test.ts sees each literal key. */}
          <ul className="mt-2 space-y-1.5 text-xs leading-snug">
            <li className={BULLET}>
              <span aria-hidden>·</span>
              <span className="min-w-0">{t('sim.safetyVerify')}</span>
            </li>
            <li className={BULLET}>
              <span aria-hidden>·</span>
              <span className="min-w-0">
                <span className="font-semibold italic">{t('sim.safetyGaps')}</span>
                <span className="block italic">{t('sim.safetyGapsDetail')}</span>
              </span>
            </li>
            <li className={BULLET}>
              <span aria-hidden>·</span>
              <span className="min-w-0">{t('sim.safetyCode')}</span>
            </li>
          </ul>
          {/* Restates the license's no-warranty and no-liability clauses. */}
          <p className="mt-2 text-[11px] leading-snug">{t('sim.safetyDisclaimer')}</p>
          <button
            onClick={() => openHelp('safety')}
            className="mt-2 inline-block whitespace-nowrap text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            {t('sim.safetyLink')} <span aria-hidden>→</span>
          </button>
        </>
      )}
    </section>
  );
}
