import { useTranslation } from 'react-i18next';
import { useIsXl } from '../common/useMediaQuery';

/** The page places it twice; `at` says which placement renders on this screen. */
export function SimpleHelp({ at }: { at: 'top' | 'side' }) {
  const { t } = useTranslation();
  const side = useIsXl();
  if (side !== (at === 'side')) return null;

  const section = (title: string, items: string[]) => (
    <div>
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-ink-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );

  const body = (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">{t('simpleTool.help.enterReady')}</p>
      {section(t('simpleTool.help.enterTitle'), [
        t('simpleTool.help.enterSize'),
        t('simpleTool.help.enterMass'),
        t('simpleTool.help.enterCg'),
        t('simpleTool.help.enterMount'),
        t('simpleTool.help.enterFins'),
        t('simpleTool.help.enterChute'),
      ])}
      {section(t('simpleTool.help.workedTitle'), [
        t('simpleTool.help.workedDrag'),
        t('simpleTool.help.workedStability'),
        t('simpleTool.help.workedFlight'),
      ])}
      {section(t('simpleTool.help.limitsTitle'), [
        t('simpleTool.help.limitsWind'),
        t('simpleTool.help.limitsNose'),
        t('simpleTool.help.limitsDesign'),
      ])}
    </div>
  );

  return side ? (
    <aside
      className="h-fit space-y-3 rounded-xl bg-surface p-3 ring-1 ring-line/10"
      aria-label={t('simpleTool.help.title')}
    >
      <h2 className="text-sm font-semibold text-ink">{t('simpleTool.help.title')}</h2>
      {body}
    </aside>
  ) : (
    <details className="rounded-xl bg-surface p-3 ring-1 ring-line/10">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{t('simpleTool.help.title')}</summary>
      <div className="mt-3">{body}</div>
    </details>
  );
}
