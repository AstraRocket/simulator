import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EXHAUST_LOOKS, exhaustIdFor, type ExhaustId } from '../../services/motors/exhaust';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { useCatalog } from '../sim/useCatalog';
import { ExhaustPreview } from '../sim/ExhaustPreview';
import { CatalogError, CatalogLoading } from '../common/CatalogLoading';
import { ToolForm } from './ToolLayout';

/**
 * Each catalog propellant name under the look it takes, and how many of them
 * are sparky. Sorted by name, so a propellant is easy to find in its tile.
 */
function propellantsByLook(catalog: readonly CatalogMotor[]): Map<ExhaustId, { names: string[]; sparky: number }> {
  const out = new Map<ExhaustId, { names: Set<string>; sparky: number }>();
  for (const m of catalog) {
    const id = exhaustIdFor(m);
    const entry = out.get(id) ?? { names: new Set<string>(), sparky: 0 };
    if (m.propInfo) entry.names.add(m.propInfo);
    if (m.sparky) entry.sparky++;
    out.set(id, entry);
  }
  return new Map(
    [...out].map(([id, e]) => [id, { names: [...e.names].sort((a, b) => a.localeCompare(b)), sparky: e.sparky }]),
  );
}

/**
 * The exhaust looks the 3D flight path draws: one tile per look, its flame
 * and smoke, what it stands for, and every propellant in the motor catalog
 * that takes it. A motor whose propellant the catalog does not name takes the
 * classic look, so it is listed there by count rather than by name.
 */
export function ExhaustTool() {
  const { t } = useTranslation();
  const { catalog, loading, error, retry } = useCatalog();
  const byLook = useMemo(() => propellantsByLook(catalog), [catalog]);
  const unnamed = useMemo(() => catalog.filter((m) => !m.propInfo).length, [catalog]);

  return (
    <ToolForm title={t('exhaust.title')} intro={t('exhaust.intro')}>
      {error && <CatalogError message={`${t('catalog.failedMotors')} ${error}`} onRetry={retry} />}
      {loading && <CatalogLoading name="motors" label={t('catalog.loadingMotors')} />}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {EXHAUST_LOOKS.map(({ id, look }) => {
          const entry = byLook.get(id);
          return (
            <li key={id} className="space-y-2 rounded-lg bg-surface p-3 ring-1 ring-line/10">
              <ExhaustPreview look={look} className="h-12 w-full" />
              <h3 className="text-sm font-semibold text-ink">{t(`exhaust.look_${id}`)}</h3>
              <p className="text-xs text-ink-muted">{t(`exhaust.about_${id}`)}</p>
              {!loading && !error && (
                <p className="text-[11px] leading-snug text-ink-soft">
                  {entry?.names.length ? entry.names.join(', ') : t('exhaust.noNames')}
                  {id === 'classic' && unnamed > 0 && <> {t('exhaust.unnamed', { n: unnamed })}</>}
                  {entry && entry.sparky > 0 && !look.sparks && <> {t('exhaust.sparkyToo', { n: entry.sparky })}</>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </ToolForm>
  );
}
