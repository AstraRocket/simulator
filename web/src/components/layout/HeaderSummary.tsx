import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useSettings } from '../../state/SettingsProvider';
import { useIsXl } from '../common/useMediaQuery';
import { useSimSummary } from './useSimSummary';
import { useElementResize } from '../common/useElementResize';
import type { StaticInfo } from '../../engine/api';
import type { HeaderSummaryPref } from '../../services/storage/settings';

/**
 * The active simulation at a glance, in the header's middle on every tab:
 * on-pad stability and loaded mass for the configuration it flies, that
 * configuration's name, the apogee of its last run, and a Run button.
 *
 * It answers "is it still stable, and what did that edit do to the flight"
 * without a trip to Design or Results. The apogee dims and says so the moment
 * an edit outdates it, which is the point: a number that silently stops being
 * true is worse than none.
 *
 * Settings ▸ General picks how much of it there is (`headerSummary`):
 * - full: every cell, labeled.
 * - compact: stability, apogee and Run on one line.
 * - off: nothing.
 * Never below 1280px: the header has no spare middle there, and the phone
 * layout has its own tabs.
 */
export function HeaderSummary() {
  const pref = useSettings().settings.headerSummary;
  const xl = useIsXl();
  const info = useWorkspaceStore((s) => s.info);
  if (!info || pref === 'off' || !xl) return null;
  // Keyed on the choice, so changing it starts the fitting over from it.
  return <FittedSummary key={pref} info={info} pref={pref} />;
}

/** A computed CSS length in px, or 0 when it is not a finite number (`auto`, empty). */
const cssPx = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The strip in the room the header has left, which is no fixed width: it is
 * whatever the tabs, the save status and the tool buttons leave over, in this
 * language and this font. So it measures rather than guessing a breakpoint.
 *
 * The wrapper takes the spare width and never asks for more (no basis, no
 * minimum), so it can never be what wraps the header onto a second row. The
 * strip inside it starts at the chosen size and, where it does not fit, steps
 * down to compact and then to nothing, before paint. A change of width starts
 * it over from the chosen size, so widening the window brings it back.
 */
function FittedSummary({ info, pref }: { info: StaticInfo; pref: HeaderSummaryPref }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  const start = pref === 'full' ? 0 : 1;
  // 0 full, 1 compact, 2 none.
  const [level, setLevel] = useState(start);
  // Bumped on each change of width, so the check runs again even when the level
  // it starts over from is the one it is already at.
  const [pass, setPass] = useState(0);
  const lastWidth = useRef(-1);

  const fit = () => {
    const wrap = wrapRef.current;
    const strip = stripRef.current;
    if (!wrap || !strip) return;
    // The strip's own margins are part of the room it needs.
    const style = getComputedStyle(strip);
    const needs = strip.offsetWidth + cssPx(style.marginLeft) + cssPx(style.marginRight);
    if (needs > wrap.clientWidth) setLevel((l) => Math.min(l + 1, 2));
  };
  useLayoutEffect(fit, [level, pass]);
  // The strip grows on its own too, when a run brings an apogee back.
  useElementResize(stripRef, fit);
  // Width only: the strip's own height changes as it steps, and starting over
  // on that would step it straight back.
  useElementResize(wrapRef, (rect) => {
    if (rect.width === lastWidth.current) return;
    lastWidth.current = rect.width;
    setLevel(start);
    setPass((p) => p + 1);
  });

  // Hidden rather than unmounted at the last step, so the strip stays the one
  // element the observer above is watching.
  //
  // `-ml-2` takes back the header's own gap before the wrapper (`xl:gap-2`, and
  // the strip only shows from xl). Empty, the wrapper still costs that gap, and
  // in the wordiest language at 1280 the row has less than that to spare: the
  // tool buttons would wrap for a strip that is not even showing. The strip's
  // `mx-2` puts the space back inside the wrapper, where it is room it needs.
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
  const { busy, blocked, stability, mass, config, configName, flight, runLabel, runTitle, onRun } =
    useSimSummary(info);
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
        // Compact shows the glyph alone, so the word moves into the name.
        aria-label={compact ? runLabel : undefined}
        className={`m-1 rounded-md text-xs font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? 'px-2' : 'px-3'
        } ${busy ? 'bg-prominent hover:bg-prominent-hover' : 'bg-accent-600 hover:bg-accent-700'}`}
      >
        {/* U+FE0E asks for the text glyphs: bare, Windows draws ▶ and ■ as
            emoji tiles that clash with the button's own fill. */}
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

/**
 * One cell, divided from the one before it: a label over the value, or in the
 * compact strip the value alone, with the label kept for a screen reader and
 * as the tooltip.
 */
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
