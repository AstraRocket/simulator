import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectConfig, selectMotorDims } from '../../state/store';
import { useSettings } from '../../state/SettingsProvider';
import { withFigureDefaults } from '../../services/design/figureStyle';
import type { StaticInfo } from '../../engine/api';
import { useSimSummary } from '../layout/useSimSummary';
import { SchematicPreview } from './SchematicPreview';

/**
 * The top of the phone's Rocket tab: the rocket drawn small, then what the
 * header strip says on a wide screen (stability, mass, the configuration it
 * flies, the last apogee and Run), stacked to fit a phone. The stats grid
 * follows it in CenterView.
 *
 * The drawing opens the Sketch tab, where it can be edited; the configuration
 * is a picker, as in the simulations table, so trying another motor is not a
 * trip to another tab.
 */
export function RocketOverview({ info }: { info: StaticInfo }) {
  const { t } = useTranslation();
  const design = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectConfig);
  const setDesignPane = useWorkspaceStore((s) => s.setDesignPane);
  const { settings } = useSettings();
  // Drawn as the Sketch tab draws it: figure styles filled in, motors seated.
  const tree = useMemo(() => withFigureDefaults(design, settings.figureStyles), [design, settings.figureStyles]);
  const motors = useMemo(() => selectMotorDims(design, config), [design, config]);
  const s = useSimSummary(info);

  return (
    <section
      aria-label={t('summary.label')}
      className="mx-3 mt-3 overflow-hidden rounded-lg bg-raised/50 text-sm ring-1 ring-line/15"
    >
      {/* Named by hidden text, not `aria-label`: the drawing's CG/CP labels are
          visible text, and a label that leaves them out is a name/content
          mismatch to a voice-control user (axe label-content-name-mismatch). */}
      <button
        onClick={() => setDesignPane('sketch')}
        title={t('summary.openSketch')}
        className="block w-full px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
      >
        <span className="sr-only">{t('summary.openSketch')}</span>
        <SchematicPreview tree={tree} info={info} motors={motors} />
      </button>
      <div className="grid grid-cols-2 border-t border-line/15">
        <Row label={t('summary.stability')}>{s.stability}</Row>
        <Row label={t('stability.mass')} divided>
          {s.mass}
        </Row>
      </div>
      <div className="border-t border-line/15">
        <Row label={t('summary.configuration')}>
          <select
            value={s.config.id}
            onChange={(e) => s.setConfig(e.target.value)}
            aria-label={t('configs.pickFor', { name: s.sim.name })}
            className="w-full rounded-md bg-raised px-1.5 py-1 font-data text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
          >
            {s.configs.map((c) => (
              <option key={c.id} value={c.id}>
                {s.configName(c)}
              </option>
            ))}
          </select>
        </Row>
      </div>
      <div className="flex items-center border-t border-line/15">
        <div className="min-w-0 flex-1">
          <Row label={t('sim.apogee')}>{s.flight}</Row>
        </div>
        <button
          onClick={s.onRun}
          disabled={!s.busy && s.blocked}
          title={s.runTitle}
          className={`m-2 rounded-md px-4 py-2 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${
            s.busy ? 'bg-prominent hover:bg-prominent-hover' : 'bg-accent-600 hover:bg-accent-700'
          }`}
        >
          {/* U+FE0E asks for the text glyph: see HeaderSummary. */}
          {s.busy ? (
            s.runLabel
          ) : (
            <>
              <span aria-hidden>{'▶︎'}</span> {s.runLabel}
            </>
          )}
        </button>
      </div>
    </section>
  );
}

/** A label over its value, as the header strip's cells read. */
function Row({ label, divided, children }: { label: string; divided?: boolean; children: ReactNode }) {
  return (
    <div className={`flex flex-col px-3 py-2 ${divided ? 'border-l border-line/15' : ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink-strong">{children}</span>
    </div>
  );
}
