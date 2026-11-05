import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { stageLabel } from '../../i18n/format';
import { useSettings } from '../../state/SettingsProvider';
import { SERIES, buildTraces, extraSeries, pairSeries, visibleSeries, type ChartFlight } from './flightChartTraces';

/** The traces of a flight, and which stages and series are shown. */
export function useChartSeries(flight: ChartFlight) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  const branches = useMemo(() => buildTraces(flight, (i, name) => stageLabel(t, i, name)), [flight, t]);
  // Memoized so each added panel's meta is a stable memo key.
  const extras = useMemo(() => extraSeries(branches), [branches]);
  const plain = useMemo(() => [...SERIES.filter((m) => !m.xy), ...extras], [extras]);
  const pairs = useMemo(() => pairSeries(settings.flightSeries, plain), [settings.flightSeries, plain]);
  const available = useMemo(() => [...SERIES, ...extras, ...pairs], [extras, pairs]);
  const on = useMemo(() => visibleSeries(settings.flightSeries, available), [settings.flightSeries, available]);

  // Exclusions, not inclusions, so a new flight shows all stages without a reset effect.
  const [offStages, setOffStages] = useState<ReadonlySet<string>>(() => new Set());
  const isOn = (k: string) => !offStages.has(k);
  const toggleStage = (k: string) =>
    setOffStages((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else if (branches.filter((b) => !next.has(b.key)).length > 1) next.add(k);
      return next;
    });
  const selectedBranches = useMemo(() => branches.filter((b) => !offStages.has(b.key)), [branches, offStages]);

  // Edits the saved list, not `on`, so a series this flight lacks keeps its place for the next.
  const saved = settings.flightSeries;
  const toggle = (k: string) =>
    update({ flightSeries: saved.includes(k) ? saved.filter((x) => x !== k) : [...saved, k] });
  const activeMetas = useMemo(() => available.filter((m) => on.includes(m.key)), [available, on]);

  return { branches, extras, plain, pairs, on, isOn, toggleStage, selectedBranches, saved, toggle, activeMetas };
}

export type ChartSeries = ReturnType<typeof useChartSeries>;
