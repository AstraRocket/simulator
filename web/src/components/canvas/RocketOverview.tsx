import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useDesignFigure } from './useDesignFigure';
import type { StaticInfo } from '../../engine/api';
import { useSimSummary } from '../layout/useSimSummary';
import { SchematicPreview } from './SchematicPreview';
import { RunToggleButton } from '../common/RunToggleButton';

export function RocketOverview({ info }: { info: StaticInfo }) {
  const { t } = useTranslation();
  const { tree, motors } = useDesignFigure();
  const setDesignPane = useWorkspaceStore((s) => s.setDesignPane);
  const s = useSimSummary(info);

  return (
    <section
      aria-label={t('summary.label')}
      className="mx-3 mt-3 overflow-hidden rounded-lg bg-raised/50 text-sm ring-1 ring-line/15"
    >
      {/* Hidden text, not `aria-label`, which fails axe label-content-name-mismatch. */}
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
        <RunToggleButton
          busy={s.busy}
          label={s.runLabel}
          onClick={s.onRun}
          disabled={!s.busy && s.blocked}
          title={s.runTitle}
          glyph="lead"
          size="md"
          className="m-2"
        />
      </div>
    </section>
  );
}

function Row({ label, divided, children }: { label: string; divided?: boolean; children: ReactNode }) {
  return (
    <div className={`flex flex-col px-3 py-2 ${divided ? 'border-l border-line/15' : ''}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink-strong">{children}</span>
    </div>
  );
}
