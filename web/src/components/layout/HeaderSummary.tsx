import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useSettings } from '../../state/SettingsProvider';
import { useIsXl } from '../common/useMediaQuery';
import { useSimSummary } from './useSimSummary';
import { useElementResize } from '../common/useElementResize';
import type { StaticInfo } from '../../engine/api';
import type { HeaderSummaryPref } from '../../services/storage/settings';

export function HeaderSummary() {
  const pref = useSettings().settings.headerSummary;
  const xl = useIsXl();
  const info = useWorkspaceStore((s) => s.info);
  if (!info || pref === 'off' || !xl) return null;
  // Keyed so changing the choice restarts the fitting.
  return <FittedSummary key={pref} info={info} pref={pref} />;
}

const cssPx = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function FittedSummary({ info, pref }: { info: StaticInfo; pref: HeaderSummaryPref }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const start = pref === 'full' ? 0 : 1;
  // 0 full, 1 compact, 2 none.
  const [level, setLevel] = useState(start);
  const [pass, setPass] = useState(0);
  const lastWidth = useRef(-1);

  const fit = () => {
    const wrap = wrapRef.current;
    const strip = stripRef.current;
    if (!wrap || !strip) return;
    const style = getComputedStyle(strip);
    const needs = strip.offsetWidth + cssPx(style.marginLeft) + cssPx(style.marginRight);
    if (needs > wrap.clientWidth) setLevel((l) => Math.min(l + 1, 2));
  };
  useLayoutEffect(fit, [level, pass]);
  useElementResize(stripRef, fit);
  // Width only: height changes as it steps, and restarting on that would loop.
  useElementResize(wrapRef, (rect) => {
    if (rect.width === lastWidth.current) return;
    lastWidth.current = rect.width;
    setLevel(start);
    setPass((p) => p + 1);
  });

  // Hidden, not unmounted, so the observer keeps watching the strip.
  // `-ml-2` cancels the header's `xl:gap-2`; the strip's `mx-2` puts it back inside.
  return (
    <div ref={wrapRef} className="-ml-2 flex min-w-0 flex-1 basis-0 justify-center overflow-hidden">
      <SummaryStrip ref={stripRef} info={info} compact={level > 0} hidden={level === 2} />
    </div>
  );
}

function SummaryStrip({
  ref,
  info,
  compact,
  hidden,
}: {
  ref: Ref<HTMLElement>;
  info: StaticInfo;
  compact: boolean;
  hidden: boolean;
}) {
  const { t } = useTranslation();
  const { busy, blocked, stability, mass, config, configName, flight, runLabel, runTitle, onRun } = useSimSummary(info);
  return (
    <section
      ref={ref}
      hidden={hidden}
      aria-label={t('summary.label')}
      className="mx-2 flex shrink-0 items-stretch overflow-hidden whitespace-nowrap rounded-lg bg-raised/50 text-xs leading-tight ring-1 ring-line/15"
    >
      <Cell label={t('summary.stability')} compact={compact}>
        {stability}
      </Cell>
      {!compact && (
        <>
          <Cell label={t('stability.mass')}>{mass}</Cell>
          <Cell label={t('summary.configuration')}>
            <span className="font-data">{configName(config)}</span>
          </Cell>
        </>
      )}
      <Cell label={t('sim.apogee')} compact={compact}>
        {flight}
      </Cell>
      <button
        onClick={onRun}
        disabled={!busy && blocked}
        title={runTitle}
        aria-label={compact ? runLabel : undefined}
        className={`m-1 rounded-md text-xs font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? 'px-2' : 'px-3'
        } ${busy ? 'bg-prominent hover:bg-prominent-hover' : 'bg-accent-600 hover:bg-accent-700'}`}
      >
        {/* U+FE0E forces text glyphs: Windows otherwise draws ▶ and ■ as emoji. */}
        {compact ? (
          <span aria-hidden>{busy ? '■︎' : '▶︎'}</span>
        ) : busy ? (
          runLabel
        ) : (
          <>
            <span aria-hidden>{'▶︎'}</span> {runLabel}
          </>
        )}
      </button>
    </section>
  );
}

function Cell({ label, compact, children }: { label: string; compact?: boolean; children: ReactNode }) {
  if (compact)
    return (
      <div title={label} className="flex items-center border-l border-line/15 px-2.5 first:border-l-0">
        <span className="sr-only">{`${label}: `}</span>
        <span className="font-semibold tabular-nums text-ink-strong">{children}</span>
      </div>
    );
  return (
    <div className="flex flex-col justify-center border-l border-line/15 px-3 py-1 first:border-l-0">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="font-semibold tabular-nums text-ink-strong">{children}</span>
    </div>
  );
}
