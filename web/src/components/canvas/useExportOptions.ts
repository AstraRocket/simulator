import { useRef, useState } from 'react';
import {
  asDistanceUnit,
  defaultExportOptions,
  type DistanceUnit,
  type FlightPathExportOptions,
} from '../../services/exports/flightPathExport';
import { useUnits } from '../../prefs/useUnits';
import { useSettings } from '../../state/SettingsProvider';
import { hydrateExportOptions, persistedExportSettings, type UnitField } from '../../services/exports/pathExportFields';

/** `patchOpts` updates the dialog only, for the never-stored mission name; `change` also persists. */
export function useExportOptions(): {
  opts: FlightPathExportOptions;
  patchOpts: (patch: Partial<FlightPathExportOptions>) => FlightPathExportOptions;
  change: (patch: Partial<FlightPathExportOptions>) => void;
  setUnit: (which: UnitField, unit: DistanceUnit) => void;
} {
  const units = useUnits();
  const { settings, update } = useSettings();
  const [opts, setOpts] = useState<FlightPathExportOptions>(() =>
    hydrateExportOptions(defaultExportOptions(units.sym('distance')), settings.pathExport),
  );
  const explicitUnits = useRef<Record<UnitField, boolean>>({
    altitude: asDistanceUnit(settings.pathExport.altitudeUnit) !== undefined,
    distance: asDistanceUnit(settings.pathExport.distanceUnit) !== undefined,
  });
  // Called from handlers, not an effect on `opts`, which would write settings on every keystroke.
  const persist = (next: FlightPathExportOptions) => {
    update({ pathExport: persistedExportSettings(next, explicitUnits.current) });
  };
  // Spreading the closed-over `opts` would drop the first of two changes made in one tick.
  const optsRef = useRef(opts);
  const patchOpts = (patch: Partial<FlightPathExportOptions>): FlightPathExportOptions => {
    const next = { ...optsRef.current, ...patch };
    optsRef.current = next;
    setOpts(next);
    return next;
  };
  const change = (patch: Partial<FlightPathExportOptions>) => persist(patchOpts(patch));
  const setUnit = (which: UnitField, unit: DistanceUnit) => {
    explicitUnits.current[which] = true;
    change(which === 'altitude' ? { altitudeUnit: unit } : { distanceUnit: unit });
  };
  return { opts, patchOpts, change, setUnit };
}
