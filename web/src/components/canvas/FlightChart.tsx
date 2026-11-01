import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { stageLabel, withFixedUnit } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { forwardFlightEnd } from '../../services/flight/flightEvents';
import { EVENT_LABEL, clusterEventLabels } from '../../services/flight/simReport';
import { FlightCsvDialog } from '../sim/FlightCsvDialog';
import { useSettings } from '../../state/SettingsProvider';
import { PAD_L, PAD_R, PANEL_H, maxFlightTime, minWindow } from './flightChartAxis';
import {
  SERIES,
  buildTraces,
  extraSeries,
  pairKey,
  pairSeries,
  panelDigits,
  panelSeries,
  traceLabel,
  traceOffset,
  traceScale,
  traceUnit,
  visibleSeries,
  type ChartFlight,
  type PanelLine,
} from './flightChartTraces';
import { hoverValue } from './FlightChartHover';
import { useChartZoom } from './useChartZoom';
import { useChartCrosshair } from './useChartCrosshair';
import { EventLabelStrip, eventStripHeight, packEventLabels } from './FlightChartEvents';
import { FlightChartPanel } from './FlightChartPanel';
import { crosshairReadout, eventsSummary } from './chartSummary';
import { FlightXYPanel } from './FlightXYPanel';
import { useElementResize } from '../common/useElementResize';
import { ToggleButton } from '../common/ToggleButton';
import { smallButton } from '../common/smallButton';

// The series catalog lives in its own module; GroundTrack imports the trace
// builder through this one.
export { buildTraces, type ChartFlight } from './flightChartTraces';

/** The add picker's entry that opens the pair row rather than adding a panel. */
const PAIR = '__pair';

/**
 * Flight data as small MULTIPLES: time on a shared x, and one
 * stacked single-series panel per measure, each with its own y-scale, because
 * measures of different magnitude are never dual-axed. A chip bar toggles which
 * panels show, and a picker beside it adds a panel for any other series the run
 * recorded (`extraSeries`); a single hover drives a synchronized crosshair +
 * value readout across every visible panel. Every series rides in on every sim
 * run.
 * The x (time) axis zooms/pans (buttons, drag, ctrl/pinch-wheel); a sticky strip
 * up top row-packs the event labels so they never overlap.
 *
 * This file is the composition: the series catalog (flightChartTraces.ts),
 * the axis and window math (flightChartAxis.ts), the zoom/pan interaction
 * (useChartZoom.ts), the crosshair (useChartCrosshair.ts), the event strip
 * (FlightChartEvents.tsx) and the panel (FlightChartPanel.tsx) each live in
 * their own module.
 */
export function FlightChart({
  flight,
  flow = false,
}: {
  flight: ChartFlight;
  /**
   * The panels run at their full length and the page around them scrolls (a
   * phone's Results tab, see CenterView), rather than scrolling in a box of
   * their own inside a page that scrolls too.
   */
  flow?: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  // Which panels are open, remembered between visits (services/storage/settings.ts).
  // Component state seeded from a constant would have anyone who works with
  // thrust or mass re-ticking them on every visit to the Results tab.
  const { settings, update } = useSettings();
  const [csvOpen, setCsvOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hostH, setHostH] = useState(0);
  // One panel shown at the pane's full height, or null for all of them.
  const [expanded, setExpanded] = useState<string | null>(null);

  // Every branch as a colored, selectable trace.
  const branches = useMemo(() => buildTraces(flight, (i, name) => stageLabel(t, i, name)), [flight, t]);
  // The built-in panels, then every other series this flight recorded. Built
  // once per flight, so each added panel's meta is a stable memo key.
  const extras = useMemo(() => extraSeries(branches), [branches]);
  // What a pair's axes can be: every time panel's series, built-in and added.
  const plain = useMemo(() => [...SERIES.filter((m) => !m.xy), ...extras], [extras]);
  // The pairs the reader added, each one series against another.
  const pairs = useMemo(() => pairSeries(settings.flightSeries, plain), [settings.flightSeries, plain]);
  const available = useMemo(() => [...SERIES, ...extras, ...pairs], [extras, pairs]);
  const on = useMemo(() => visibleSeries(settings.flightSeries, available), [settings.flightSeries, available]);
  const multistage = branches.length >= 2;

  // Which traces are hidden. Exclusions rather than inclusions: a new set of
  // stages is all shown by construction (none of its keys is in the set), so
  // no effect has to reset the selection when the flight changes, and there is
  // no first frame drawn with a stale list. The last shown stage cannot be
  // hidden (nothing to plot otherwise).
  const [offStages, setOffStages] = useState<ReadonlySet<string>>(() => new Set());
  const isOn = (k: string) => !offStages.has(k);
  const toggleStage = (k: string) =>
    setOffStages((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else if (branches.filter((b) => !next.has(b.key)).length > 1) next.add(k);
      return next;
    });
  // Stable across hover re-renders so the panels don't recompute their paths on
  // every pointer move (the memo below keys on this reference).
  const selectedBranches = useMemo(() => branches.filter((b) => !offStages.has(b.key)), [branches, offStages]);

  // x-axis spans every branch, so a booster that lands after the sustainer still
  // fits (its own descent runs on the same launch clock).
  // Memoized: hovering sets state, so the render body runs on every pointer
  // move and this must not walk every sample again each time.
  const maxT = useMemo(
    () => maxFlightTime(branches, flight.result.summary.flightTime),
    [branches, flight.result.summary.flightTime],
  );

  const iw = w - PAD_L - PAD_R;
  const zoomCtl = useChartZoom(hostRef, maxT, iw);
  const { t0, t1, zoomed, X, invX, localX, zoomAt } = zoomCtl;
  const crosshair = useChartCrosshair(t0, t1);
  const { hoverT, setHoverT } = crosshair;

  useElementResize(hostRef, (r) => {
    setW(Math.max(280, r.width));
    setHostH(r.height);
  });

  const centerT = () => hoverT ?? (t0 + t1) / 2;

  // Events of every shown stage (a spent booster carries its own apogee, deploy
  // and ground-hit). De-selecting a stage drops its markers too.
  const events = useMemo(
    () => selectedBranches.flatMap((b) => b.events).filter((e) => EVENT_LABEL[e.type] && e.time <= maxT),
    [selectedBranches, maxT],
  );

  // Boost→apogee window: aero series (CP / stability / q·α) are only meaningful until
  // the rocket stops flying forward, the same end the Max q·α tile measures to.
  const clipT = useMemo(() => {
    const end = forwardFlightEnd({ events: flight.result.events ?? [], summary: flight.result.summary });
    return Number.isFinite(end) ? end : maxT;
  }, [flight, maxT]);

  // Cluster near-coincident event labels (a recovery deployment always keeps its
  // own marker), drop any outside the visible window, then row-pack them.
  const eventLabels = useMemo(() => {
    const labelW = (type: string) => t(EVENT_LABEL[type] ?? type).length * 5.2 + 10;
    return packEventLabels(clusterEventLabels(events, X), w, labelW);
    // `X` is the memoized time-to-px map and already changes with the window
    // (t0, t1) and the width, so listing it is both honest and sufficient.
  }, [events, X, w, t]);
  const stripH = eventStripHeight(eventLabels);
  // The event strip in words, for a screen reader: every shown event in time
  // order, including the ones the strip clusters or the zoom window hides.
  const eventsText = useMemo(() => eventsSummary(t, events, (type) => t(EVENT_LABEL[type] ?? type)), [events, t]);

  // Edits the saved list itself rather than `on`, so a series this flight did
  // not record keeps its place for the next flight that does.
  const saved = settings.flightSeries;
  const toggle = (k: string) =>
    update({ flightSeries: saved.includes(k) ? saved.filter((x) => x !== k) : [...saved, k] });
  const activeMetas = useMemo(() => available.filter((m) => on.includes(m.key)), [available, on]);
  // The added panels that are open get a chip like the built-in ones, which is
  // how one is closed again; the rest are offered by the picker.
  const openExtras = extras.filter((m) => on.includes(m.key));
  const addable = extras.filter((m) => !on.includes(m.key));
  // The two axes of a pair being chosen, or null when no pair is.
  const [pairing, setPairing] = useState<{ y: string; x: string } | null>(null);
  const pairReady = !!pairing?.y && !!pairing.x && pairing.y !== pairing.x;
  const pill =
    'rounded-full bg-raised px-2.5 py-1 text-[11px] font-medium text-ink-muted ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';
  // An expanded panel that has since been switched off drops the expansion
  // rather than leaving the pane empty.
  const solo = expanded && on.includes(expanded) ? expanded : null;
  const shownMetas = solo ? activeMetas.filter((m) => m.key === solo) : activeMetas;
  // The pane less the event strip and the panel's own header and margins. A
  // phone's pane is as tall as its panels, so it has no height to fill: twice
  // the usual panel instead.
  const soloH = flow ? 2 * PANEL_H : Math.max(PANEL_H, hostH - stripH - 48);
  const panelH = solo ? soloH : PANEL_H;
  const toggleExpand = (k: string) => setExpanded(solo === k ? null : k);

  // The live region's text: the time the keyboard moved to and each shown
  // panel's primary-stage value there, the figures its header reads. Only key
  // steps change it (see useChartCrosshair), so a mouse hover stays quiet.
  const { keyT } = crosshair;
  const primary = selectedBranches[0];
  // Each panel's header decimals, from the same span the header uses. Built
  // only once the keyboard has moved the crosshair, since a pointer never
  // writes the live region.
  const announcing = keyT != null;
  const panelOf = useMemo(() => {
    const out = new Map<string, { digits: number; primary: PanelLine | undefined }>();
    if (!announcing) return out;
    for (const m of activeMetas) {
      if (m.xy) continue;
      const { list, lo, hi } = panelSeries(selectedBranches, m, traceScale(m, u), clipT, traceOffset(m, u));
      out.set(m.key, { digits: panelDigits(m, lo, hi), primary: list[0] });
    }
    return out;
  }, [announcing, activeMetas, selectedBranches, u, clipT]);
  const announcement =
    keyT == null || !primary
      ? ''
      : crosshairReadout(
          `${t('flight.time')} ${withFixedUnit(keyT, t('units.second'), 2)}`,
          shownMetas
            .filter((m) => !m.xy && !(m.aero && keyT > clipT))
            .map((m) => {
              // The header's own figure: none outside the primary stage's span.
              const panel = panelOf.get(m.key);
              return {
                label: traceLabel(m, t),
                value: panel?.primary ? hoverValue(panel.primary, keyT) : null,
                digits: panel?.digits ?? m.digits,
                unit: traceUnit(m, u, t),
              };
            }),
        );

  // Pointer: drag pans (only when zoomed in); otherwise it drives the hover crosshair.
  const onDown = (e: React.PointerEvent) => {
    if (zoomCtl.startPan(e)) setHoverT(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (zoomCtl.pan(e)) return;
    setHoverT(crosshair.clampT(invX(localX(e.clientX))));
  };

  const zBtn = smallButton('chip', 'ink');

  return (
    <div className="flex h-full flex-col rounded-xl bg-surface ring-1 ring-line/10">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('flight.title')}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-ink-muted">
            {t('flight.time')} {withFixedUnit(hoverT ?? maxT, t('units.second'), hoverT != null ? 2 : 1)}
          </span>
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
          {/* In, out, fit: the schematic's and the site map's order. */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => zoomAt(0.6, centerT())}
              // At the narrowest window a press would change nothing.
              disabled={t1 - t0 <= minWindow(maxT) + 1e-9}
              title={t('flight.zoomIn')}
              aria-label={t('flight.zoomIn')}
              className={zBtn}
            >
              +
            </button>
            <button
              onClick={() => zoomAt(1 / 0.6, centerT())}
              disabled={!zoomed}
              title={t('flight.zoomOut')}
              aria-label={t('flight.zoomOut')}
              className={zBtn}
            >
              −
            </button>
            <button
              onClick={zoomCtl.reset}
              disabled={!zoomed}
              title={t('flight.zoomReset')}
              aria-label={t('flight.zoomReset')}
              className={zBtn}
            >
              ⤢
            </button>
          </div>
          <button
            onClick={() => setCsvOpen(true)}
            title={t('flight.exportCsv')}
            aria-label={t('flight.exportCsv')}
            className={smallButton('chip', 'ink')}
          >
            <span aria-hidden>⬇</span> CSV
          </button>
        </div>
      </div>
      {multistage && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            {t('flight.stages')}
          </span>
          {branches.map((b) => {
            const active = isOn(b.key);
            // The only stage shown cannot be turned off, so it says so rather
            // than taking the press and doing nothing. aria-disabled, not
            // disabled: it stays focusable, so the reason can be read.
            const locked = active && selectedBranches.length === 1;
            return (
              <button
                key={b.key}
                onClick={() => toggleStage(b.key)}
                aria-pressed={active}
                aria-disabled={locked || undefined}
                title={locked ? t('flight.lastStageShown') : undefined}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 aria-disabled:cursor-not-allowed ${active ? 'bg-elevated text-ink-strong ring-line/20' : 'bg-raised text-ink-muted ring-line/10'}`}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: b.color, opacity: active ? 1 : 0.4 }}
                />
                {b.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        {[...SERIES, ...openExtras, ...pairs].map((m) => {
          const active = on.includes(m.key);
          return (
            <ToggleButton
              key={m.key}
              active={active}
              onClick={() => toggle(m.key)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-line/10"
            >
              {traceLabel(m, t)}
            </ToggleButton>
          );
        })}
        {/* Every other series the run recorded, each as a panel of its own,
            and the way to plot one series against another. A select rather
            than more chips: there are dozens, and a reset value keeps it
            reading as an action, not a setting. */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value === PAIR) setPairing({ y: '', x: '' });
            else if (e.target.value) toggle(e.target.value);
          }}
          aria-label={t('flight.addSeries')}
          className={`max-w-48 ${pill}`}
        >
          <option value="">{t('flight.addSeries')}</option>
          <option value={PAIR}>{t('flight.addPair')}</option>
          {addable.map((m) => (
            <option key={m.key} value={m.key}>
              {traceLabel(m, t)}
            </option>
          ))}
        </select>
      </div>
      {pairing && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {(['y', 'x'] as const).map((axis) => (
            <select
              key={axis}
              value={pairing[axis]}
              onChange={(e) => setPairing({ ...pairing, [axis]: e.target.value })}
              aria-label={t(axis === 'y' ? 'flight.pairY' : 'flight.pairX')}
              className={`max-w-48 ${pill}`}
            >
              <option value="">{t(axis === 'y' ? 'flight.pairY' : 'flight.pairX')}</option>
              {plain.map((m) => (
                <option key={m.key} value={m.key}>
                  {traceLabel(m, t)}
                </option>
              ))}
            </select>
          ))}
          <button
            type="button"
            disabled={!pairReady}
            onClick={() => {
              const key = pairKey(pairing.y, pairing.x);
              if (!saved.includes(key)) toggle(key);
              setPairing(null);
            }}
            className={smallButton('chip', 'ink')}
          >
            {t('flight.pairAdd')}
          </button>
          <button type="button" onClick={() => setPairing(null)} className={smallButton('chip', 'ink')}>
            {t('common.cancel')}
          </button>
        </div>
      )}
      {/*
        Focusable, so every number these charts carry can be reached without a
        pointer: the arrows step the crosshair, Shift for a coarse step,
        Home/End for the ends, Escape to drop it. Each key step is announced
        through the live region in the header: the time and every shown
        panel's value.
      */}
      <div // eslint-disable-line jsx-a11y-x/no-noninteractive-element-interactions -- a focusable crosshair: the arrows move it, and the group names it without claiming a widget role it does not fit
        ref={hostRef}
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focusable crosshair: the arrows move it, and the group names it without claiming a widget role it does not fit
        tabIndex={0}
        role="group"
        aria-label={t('flight.crosshairHint')}
        className={`${flow ? '' : 'min-h-0 flex-1 overflow-y-auto'} px-3 pb-3 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-inset focus-visible:outline-none ${zoomed ? 'cursor-grab' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={zoomCtl.endPan}
        onPointerCancel={zoomCtl.endPan}
        onFocus={crosshair.onFocus}
        onBlur={crosshair.onBlur}
        onKeyDown={crosshair.onKeyDown}
        onPointerLeave={() => {
          if (!zoomCtl.isPanning()) setHoverT(null);
        }}
      >
        {activeMetas.length === 0 ? (
          <p className="grid h-full place-items-center text-sm text-ink-faint">{t('flight.pickSeries')}</p>
        ) : (
          <>
            {eventsText && <p className="sr-only">{eventsText}</p>}
            {stripH > 0 && <EventLabelStrip labels={eventLabels} w={w} stripH={stripH} t={t} />}
            {shownMetas.map((m) =>
              m.xy ? (
                <FlightXYPanel
                  key={m.key}
                  meta={m}
                  branches={selectedBranches}
                  w={w}
                  height={panelH}
                  hoverT={hoverT}
                  clipT={clipT}
                  expanded={solo === m.key}
                  onToggleExpand={() => toggleExpand(m.key)}
                />
              ) : (
                <FlightChartPanel
                  key={m.key}
                  meta={m}
                  branches={selectedBranches}
                  w={w}
                  X={X}
                  hoverT={hoverT}
                  clipT={clipT}
                  events={events}
                  height={panelH}
                  expanded={solo === m.key}
                  onToggleExpand={() => toggleExpand(m.key)}
                />
              ),
            )}
          </>
        )}
      </div>
      {csvOpen && <FlightCsvDialog result={flight.result} simName={flight.name} onClose={() => setCsvOpen(false)} />}
    </div>
  );
}
