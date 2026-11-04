import { useLauncherT } from '../common/useLauncher';
import { useUnits } from '../../prefs/useUnits';
import { useWorkspaceStore } from '../../state/store';
import { warningText } from '../../services/app/warningText';

export function DesignWarnings() {
  const t = useLauncherT();
  const u = useUnits();
  const texts = useWorkspaceStore((s) => s.info?.warningTexts);
  if (!texts?.length) return null;

  return (
    <section
      aria-label={t('design.warnings', { count: texts.length })}
      className="mx-3 mb-2 rounded-xl bg-warn-500/10 p-3 ring-1 ring-warn-400/30"
    >
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-warn-200">
        {t('design.warnings', { count: texts.length })}
      </div>
      <ul className="space-y-1">
        {texts.map((text, i) => (
          <li key={`${text}-${i}`} className="flex gap-2 text-xs text-warn-200">
            <span aria-hidden>⚠</span>
            <span className="min-w-0">{warningText(text, t, (q, si) => u.fmtSym(q, si))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
