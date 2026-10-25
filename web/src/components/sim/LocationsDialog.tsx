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

/**
 * The saved launch locations, listed on the left and edited on the right.
 *
 * Self-contained on purpose: it loads from the `LaunchLocationStore` itself, so
 * it works both from a `LocationPicker`'s ⚙ (the launch panel, Settings > Launch
 * defaults and the tools' site fields, where the site fields are on screen) and
 * from the menu (where they are not). That is why it exists as its own component
 * rather than living inside `LocationPicker`: a manage view reachable only from
 * the panels that already have a dropdown is hard to find.
 *
 * Master-detail rather than a list that opens a dialog per row: correcting a
 * set of coordinates is something you do to several fields in a sitting, and a
 * modal per location makes each one a separate errand. It also gives the map
 * room to be useful.
 *
 * "Use" writes to the site fields of whatever opened the dialog: a picker passes
 * `onApply`, which edits the fields it shows. With no `onApply` (the menu) it
 * writes to the active simulation only, as one undo step, even when rows are
 * ticked: the menu is away from the editor's "editing N simulations" banner,
 * and a site written to rows nothing on screen names is a change nobody sees
 * being made.
 */
export function LocationsDialog({
  onClose,
  onApply,
}: {
  onClose: () => void;
  /** Writes a location's site where the opener shows it; the active simulation when absent. */
  onApply?: (location: LaunchLocation) => void;
}) {
  const { t } = useTranslation();
  const patchActiveLaunch = useWorkspaceStore((s) => s.patchActiveLaunch);
  // The launch panel's own altitude unit and scope, so this list reads in feet
  // for somebody who works in feet rather than always in meters.
  const altUnit = useUnits().at(unitScope('launch', SITE_ALTITUDE_FIELD), LAUNCH_SI.distance.q);

  const { locations, error: listError, write } = useLocationList();
  // `null` = nothing selected. A string = that location. `'new'` = the draft.
  const { selectedId, select, settle, close, onDirtyChange, err, setErr } = useGuardedSelection(
    t('location.discardConfirm'),
  );

  const creating = selectedId === NEW;
  // Resolved from the list rather than held as its own copy, so a save (which
  // refreshes the list under this pane) leaves the detail showing what was
  // stored, and a location deleted in another tab clears the selection instead
  // of editing something that is gone.
  const selected = creating ? null : ((locations ?? []).find((p) => p.id === selectedId) ?? null);
  const showsDetail = creating || selected !== null;

  const store = (fn: () => Promise<void>) => write(fn, setErr);

  const save = async (location: LaunchLocation) => {
    // Save replaces by id, so this is the one call for both editing an
    // existing location and adding a new one.
    // Stay on what was just written, so a new location becomes the selected
    // one rather than dropping the user back to an empty pane.
    if (await store(() => getLaunchLocationStore().save(location))) settle(location.id);
  };

  const remove = async (location: LaunchLocation) => {
    // A location can be the only record of coordinates somebody measured at a field.
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
        // The only way to add a location from the menu, where no launch field
        // is on screen to capture. From the launch panel the 💾 button is
        // the quicker route, since the numbers are already there.
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
              // Reachable from the menu before anything is saved, so it has to
              // say what a location is and where they come from.
              <p className="p-6 text-center text-sm leading-snug text-ink-muted">{t('location.empty')}</p>
            ) : (
              <ul className="divide-y divide-line/5">
                {locations.map((p) => (
                  <li key={p.id}>
                    <MasterRow selected={p.id === selectedId} onClick={() => void select(p.id)}>
                      <span className="block truncate text-sm text-ink-strong">{p.name}</span>
                      {/* Plain coordinates: the row that lets you tell two
                          fields both called "the club field" apart. */}
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
              // Keyed on the selection, so choosing another location re-seeds
              // every field by remounting rather than through an effect.
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

/** The selection token for the location being created, which has no id yet. */
const NEW = 'new';
