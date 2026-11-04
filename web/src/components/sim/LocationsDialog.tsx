import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { confirm } from '../../state/confirmStore';
import { MasterDetail, MasterRow, useGuardedSelection, MasterDetailDialog } from '../common/MasterDetail';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { LAUNCH_SI, SITE_ALTITUDE_FIELD } from '../../prefs/launchUnits';
import { LocationEditor } from './LocationEditor';
import { getLaunchLocationStore, type LaunchLocation, siteOf } from '../../services/storage/launchLocationStore';
import { useLocationList } from './useLocationList';
import { formatCoord } from '../../services/map/slippyMap';
import { smallButton } from '../common/smallButton';

/** Without `onApply` (the menu), "Use" writes to the active simulation only, even when rows are ticked. */
export function LocationsDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply?: (location: LaunchLocation) => void;
}) {
  const { t } = useTranslation();
  const patchActiveLaunch = useWorkspaceStore((s) => s.patchActiveLaunch);
  const altUnit = useUnits().at(unitScope('launch', SITE_ALTITUDE_FIELD), LAUNCH_SI.distance.q);

  const { locations, error: listError, write } = useLocationList();
  // `null` = nothing selected. A string = that location. `'new'` = the draft.
  const { selectedId, select, settle, close, onDirtyChange, err, setErr } = useGuardedSelection(
    t('location.discardConfirm'),
  );

  const creating = selectedId === NEW;
  // Resolved from the list, so a location deleted in another tab clears the selection.
  const selected = creating ? null : ((locations ?? []).find((p) => p.id === selectedId) ?? null);
  const showsDetail = creating || selected !== null;

  const store = (fn: () => Promise<void>) => write(fn, setErr);

  const save = async (location: LaunchLocation) => {
    if (await store(() => getLaunchLocationStore().save(location))) settle(location.id);
  };

  const remove = async (location: LaunchLocation) => {
    const ok = await confirm({
      message: t('location.deleteConfirm', { name: location.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    if (await store(() => getLaunchLocationStore().remove(location.id))) settle(null);
  };

  const apply = (location: LaunchLocation) => {
    if (onApply) onApply(location);
    else patchActiveLaunch(siteOf(location));
    onClose();
  };

  return (
    <MasterDetailDialog
      id="locations"
      title={t('location.manage')}
      onClose={onClose}
      close={close}
      err={err ?? listError}
      loading={locations === null}
      actions={
        <button onClick={() => void select(NEW)} className={smallButton('xs', 'ink')}>
          {t('location.new')}
        </button>
      }
    >
      {locations && (
        <MasterDetail
          showsDetail={showsDetail}
          hint={t('location.pickHint')}
          list={
            locations.length === 0 && listError === null ? (
              <p className="p-6 text-center text-sm leading-snug text-ink-muted">{t('location.empty')}</p>
            ) : (
              <ul className="divide-y divide-line/5">
                {locations.map((p) => (
                  <li key={p.id}>
                    <MasterRow selected={p.id === selectedId} onClick={() => void select(p.id)}>
                      <span className="block truncate text-sm text-ink-strong">{p.name}</span>
                      <span className="block text-xs tabular-nums text-ink-faint">
                        {formatCoord(p.latitudeDeg, p.longitudeDeg)}
                        {p.launchAltitudeM !== null && ` · ${altUnit.fmtSym(p.launchAltitudeM, 0)}`}
                      </span>
                    </MasterRow>
                  </li>
                ))}
              </ul>
            )
          }
          detail={
            <LocationEditor
              key={selectedId ?? NEW}
              location={selected}
              takenNames={(locations ?? []).filter((p) => p.id !== selected?.id).map((p) => p.name)}
              onDirtyChange={onDirtyChange}
              onSave={(location) => void save(location)}
              onDelete={selected ? () => void remove(selected) : undefined}
              onApply={selected ? () => apply(selected) : undefined}
              onBack={() => void select(null)}
            />
          }
        />
      )}
    </MasterDetailDialog>
  );
}

const NEW = 'new';
