import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { forwardFlightEnd } from '../../services/flight/flightEvents';
import { EVENT_LABEL, clusterEventLabels } from '../../services/flight/simReport';
import { FlightCsvDialog } from '../sim/FlightCsvDialog';
import { PAD_L, PAD_R, PANEL_H, maxFlightTime } from './flightChartAxis';
import type { ChartFlight } from './flightChartTraces';
import { useChartZoom } from './useChartZoom';
import { useChartCrosshair } from './useChartCrosshair';
import { useChartSeries } from './useChartSeries';
import { useCrosshairAnnouncement } from './useCrosshairAnnouncement';
import { EventLabelStrip } from './FlightChartEvents';
import { eventStripHeight, packEventLabels } from './flightChartEventLabels';
import { FlightChartHeader, SeriesPicker, StageToggles } from './FlightChartControls';
import { FlightChartPanel } from './FlightChartPanel';
import { eventsSummary } from './chartSummary';
import { FlightXYPanel } from './FlightXYPanel';
import { useElementResize } from '../common/useElementResize';

export type { ChartFlight } from './flightChartTraces';

export function FlightChart({ flight, flow = false }: { flight: ChartFlight; flow?: boolean }) {
  const { t } = useTranslation();
  const [csvOpen, setCsvOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hostH, setHostH] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const series = useChartSeries(flight);
  const { branches, selectedBranches, on, activeMetas } = series;
  const multistage = branches.length >= 2;

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

  const events = useMemo(
    () => selectedBranches.flatMap((b) => b.events).filter((e) => EVENT_LABEL[e.type] && e.time <= maxT),
    [selectedBranches, maxT],
  );

  const clipT = useMemo(() => {
    const end = forwardFlightEnd({ events: flight.result.events ?? [], summary: flight.result.summary });
    return Number.isFinite(end) ? end : maxT;
  }, [flight, maxT]);

  const eventLabels = useMemo(() => {
    const labelW = (type: string) => t(EVENT_LABEL[type] ?? type).length * 5.2 + 10;
    return packEventLabels(clusterEventLabels(events, X), w, labelW);
    // `X` already changes with the window (t0, t1) and the width.
  }, [events, X, w, t]);
  const stripH = eventStripHeight(eventLabels);
  const eventsText = useMemo(() => eventsSummary(t, events, (type) => t(EVENT_LABEL[type] ?? type)), [events, t]);

  const solo = expanded && on.includes(expanded) ? expanded : null;
  const shownMetas = solo ? activeMetas.filter((m) => m.key === solo) : activeMetas;
  const soloH = flow ? 2 * PANEL_H : Math.max(PANEL_H, hostH - stripH - 48);
  const panelH = solo ? soloH : PANEL_H;
  const toggleExpand = (k: string) => setExpanded(solo === k ? null : k);

  const announcement = useCrosshairAnnouncement(crosshair.keyT, selectedBranches, activeMetas, shownMetas, clipT);

  const onDown = (e: React.PointerEvent) => {
    if (zoomCtl.startPan(e)) setHoverT(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (zoomCtl.pan(e)) return;
    setHoverT(crosshair.clampT(invX(localX(e.clientX))));
  };

  return (
    <div className="flex h-full flex-col rounded-xl bg-surface ring-1 ring-line/10">
      <FlightChartHeader
        hoverT={hoverT}
        maxT={maxT}
        announcement={announcement}
        t0={t0}
        t1={t1}
        zoomed={zoomed}
        zoomAt={zoomAt}
        onZoomReset={zoomCtl.reset}
        centerT={centerT}
        onCsv={() => setCsvOpen(true)}
      />
      {multistage && <StageToggles series={series} />}
      <SeriesPicker series={series} />
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
