import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { GeoNamesCredit } from '../common/OpenMeteoCredit';
import { useLatest } from '../common/useLatest';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { LAUNCH_SI, SITE_ALTITUDE_FIELD } from '../../prefs/launchUnits';
import { formatCoord } from '../../services/map/slippyMap';
import { parseCoordinateText } from '../../services/map/coordinateText';
import { fetchElevation, searchPlaces, type PlaceMatch } from '../../services/weather/openMeteo';
import { readWeatherKey } from '../../services/weather/weatherKey';
import { weatherErrorText } from '../../services/weather/weatherErrorText';
import { useOnline } from '../common/useOnline';
import { baseLanguage } from '../../i18n/language';

export interface PlacePick {
  latitudeDeg: number;
  longitudeDeg: number;
  launchAltitudeM: number | null;
}

interface Row {
  key: string;
  title: string;
  detail: string | null;
  latitudeDeg: number;
  longitudeDeg: number;
  /** undefined while the lookup runs; null when there is none. */
  elevationM: number | null | undefined;
}

type State =
  { kind: 'idle' } | { kind: 'searching' } | { kind: 'rows'; rows: Row[] } | { kind: 'message'; text: string };

/** One i18n key so each language orders them; not a list format, which would join with "and". */
const placeDetail = (p: PlaceMatch, t: (k: string, o?: Record<string, unknown>) => string): string | null =>
  p.region && p.country
    ? t('placeSearch.regionCountry', { region: p.region, country: p.country })
    : p.region || p.country || null;

const placeRow = (p: PlaceMatch, i: number, t: (k: string, o?: Record<string, unknown>) => string): Row => ({
  key: `${i}:${p.latitudeDeg},${p.longitudeDeg}`,
  title: p.name,
  detail: placeDetail(p, t),
  latitudeDeg: p.latitudeDeg,
  longitudeDeg: p.longitudeDeg,
  elevationM: p.elevationM,
});

/** Geocoding goes through the weather transport, so the request names neither this app nor its site. */
export function PlaceSearchDialog({ onPick, onClose }: { onPick: (pick: PlacePick) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const altUnit = useUnits().at(unitScope('launch', SITE_ALTITUDE_FIELD), LAUNCH_SI.distance.q);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const request = useLatest();
  const online = useOnline();
  const needsNetwork = query.trim() !== '' && parseCoordinateText(query) === null;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const search = async () => {
    const text = query.trim();
    if (text === '') return;
    const signal = request.claimSignal();
    const parsed = parseCoordinateText(text);
    if (parsed?.kind === 'shortLink') {
      setState({ kind: 'message', text: t('placeSearch.shortLink') });
      return;
    }
    if (parsed) {
      const row: Row = {
        key: 'coords',
        title: t('placeSearch.coords'),
        detail: null,
        latitudeDeg: parsed.latitudeDeg,
        longitudeDeg: parsed.longitudeDeg,
        elevationM: undefined,
      };
      setState({ kind: 'rows', rows: [row] });
      const elevationM = await fetchElevation(parsed.latitudeDeg, parsed.longitudeDeg, readWeatherKey(), {
        signal,
      }).catch(() => null);
      if (!signal.aborted) setState({ kind: 'rows', rows: [{ ...row, elevationM }] });
      return;
    }
    setState({ kind: 'searching' });
    try {
      const places = await searchPlaces(text, baseLanguage(i18n.language), readWeatherKey(), {
        signal,
      });
      if (signal.aborted) return;
      setState(
        places.length === 0
          ? { kind: 'message', text: t('placeSearch.none') }
          : { kind: 'rows', rows: places.map((p, i) => placeRow(p, i, t)) },
      );
    } catch (err) {
      if (!signal.aborted) setState({ kind: 'message', text: weatherErrorText(err, t) });
    }
  };

  const elevationText = (e: number | null | undefined) =>
    e === undefined
      ? t('placeSearch.elevationLooking')
      : e === null
        ? t('placeSearch.elevationUnknown')
        : altUnit.fmtSym(e, 0);

  return (
    <Dialog id="placeSearch" title={t('placeSearch.title')} onClose={onClose} layout="pad" size="md">
      <label htmlFor="place-search" className="mt-4 block text-xs font-medium text-ink-muted">
        {t('placeSearch.label')}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="place-search"
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
          placeholder={t('placeSearch.placeholder')}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg bg-raised px-3 py-2 text-sm text-ink-strong ring-1 ring-line/10 focus:ring-accent-500"
        />
        <DialogButton
          onClick={() => void search()}
          disabled={query.trim() === '' || state.kind === 'searching' || (needsNetwork && !online)}
          title={needsNetwork && !online ? t('common.needsConnection') : undefined}
          variant="primary"
        >
          {state.kind === 'searching' ? t('placeSearch.searching') : t('placeSearch.search')}
        </DialogButton>
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">{t('placeSearch.hint')}</p>

      {/* Mounted always, so what lands in it is announced. */}
      <div role="status" aria-live="polite" className="mt-3">
        {state.kind === 'message' && <p className="text-xs text-warn-300">{state.text}</p>}
        {state.kind === 'rows' && (
          <ul className="space-y-1">
            {state.rows.map((r) => (
              <li key={r.key}>
                <button
                  onClick={() =>
                    onPick({
                      latitudeDeg: r.latitudeDeg,
                      longitudeDeg: r.longitudeDeg,
                      launchAltitudeM: r.elevationM ?? null,
                    })
                  }
                  // Not before the elevation lookup answers, or the site is written with none.
                  disabled={r.elevationM === undefined}
                  className="w-full rounded-lg bg-raised/60 px-3 py-2 text-left ring-1 ring-line/10 hover:bg-elevated disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="block text-sm text-ink-strong">
                    {r.title}
                    {r.detail && <span className="text-ink-muted"> · {r.detail}</span>}
                  </span>
                  <span className="block text-[11px] text-ink-muted">
                    {formatCoord(r.latitudeDeg, r.longitudeDeg)} · {elevationText(r.elevationM)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* GeoNames' license asks for the credit wherever its places are shown. */}
      <GeoNamesCredit className="mt-4 text-[11px] text-ink-faint" />

      <DialogActions>
        <DialogButton onClick={onClose} variant="secondary">
          {t('common.cancel')}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}
