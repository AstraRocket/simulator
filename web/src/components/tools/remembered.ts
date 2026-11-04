import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { LaunchConditions } from '../../services/design/orkTree';
import { forecastStart } from '../../services/weather/openMeteo';
import type { ToolSite } from './SiteFields';

export interface RememberedSlot<T> {
  value: Partial<T>;
  hold: <K extends keyof T>(key: K, value: T[K]) => void;
  forget: () => void;
}

export function rememberedSlot<T>(): RememberedSlot<T> {
  const slot: RememberedSlot<T> = {
    value: {},
    hold: (key, value) => {
      slot.value[key] = value;
    },
    forget: () => {
      slot.value = {};
    },
  };
  return slot;
}

/** A held `null` is a value, so a cleared box stays cleared. */
export function useRemembered<T, K extends keyof T>(
  slot: RememberedSlot<T>,
  key: K,
  init: T[K],
  restore?: (held: T[K]) => T[K],
): [T[K], Dispatch<SetStateAction<T[K]>>] {
  const [value, setValue] = useState<T[K]>(() => {
    if (!(key in slot.value)) return init;
    const held = slot.value[key] as T[K];
    return restore ? restore(held) : held;
  });
  useEffect(() => {
    slot.hold(key, value);
  }, [slot, key, value]);
  return [value, setValue];
}

export function defaultToolSite(defaults: Pick<LaunchConditions, 'latitudeDeg' | 'longitudeDeg'>): ToolSite {
  return { latitudeDeg: defaults.latitudeDeg, longitudeDeg: defaults.longitudeDeg, launchAltitudeM: null };
}

export interface ForecastFields {
  site: ToolSite;
  date: string;
  hour: number;
}

export function useForecastFields<T extends ForecastFields>(
  slot: RememberedSlot<T>,
  defaults: Pick<LaunchConditions, 'latitudeDeg' | 'longitudeDeg'>,
) {
  const start = forecastStart();
  const [site, setSite] = useRemembered(slot, 'site', defaultToolSite(defaults) as T['site']);
  const [date, setDate] = useRemembered(slot, 'date', start.date as T['date']);
  const [hour, setHour] = useRemembered(slot, 'hour', start.hour as T['hour']);
  return { site, setSite, date, setDate, hour, setHour };
}
