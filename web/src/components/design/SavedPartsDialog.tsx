import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm } from '../../state/confirmStore';
import { MasterDetail, MasterRow, MasterDetailDialog } from '../common/MasterDetail';
import { useGuardedSelection } from '../common/useGuardedSelection';
import { fmtNum } from '../../i18n/format';
import { useUnits, type Units } from '../../prefs/useUnits';
import { DEFAULT_CHUTE_CD } from '../../services/parts/componentFilter';
import { deleteCustomPart, type SavedPartEntry } from '../../services/parts/customParts';
import type { Component } from '../../services/parts/componentDb';
import { SavedPartEditor } from './SavedPartEditor';
import { useSavedParts } from './useSavedParts';
import { groupSavedParts } from './savedPartGroups';
import { errorText } from '../../i18n/keyedError';

export function SavedPartsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const u = useUnits();
  const { entries, error: listError } = useSavedParts();
  const { selectedId, select, settle, close, onDirtyChange, err, setErr } = useGuardedSelection(
    t('picker.savedDiscardConfirm'),
  );

  const groups = useMemo(() => (entries ? groupSavedParts(entries) : []), [entries]);

  // Resolved from the list, not copied, so a part deleted in another tab clears the selection.
  const selected = entries?.find((e) => e.part.id === selectedId) ?? null;

  const remove = async (e: SavedPartEntry) => {
    const ok = await confirm({
      message: t('picker.deleteSavedConfirm', { name: e.part.partNo }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    try {
      await deleteCustomPart(e.part.id);
      settle(null);
    } catch (err2) {
      setErr(errorText(err2, t));
    }
  };

  return (
    <MasterDetailDialog
      id="savedParts"
      title={t('picker.savedManage')}
      onClose={onClose}
      close={close}
      err={err ?? listError}
      loading={entries === null}
    >
      {entries?.length === 0 && listError === null ? (
        <p className="grid flex-1 place-items-center p-6 text-center text-sm leading-snug text-ink-muted">
          {t('picker.savedEmpty')}
        </p>
      ) : (
        <MasterDetail
          showsDetail={selected !== null}
          hint={t('picker.savedPickHint')}
          list={
            <>
              {groups.map(({ type, list }) => (
                <section key={type}>
                  <h3 className="sticky top-0 bg-surface px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t(`part.${type}`, { defaultValue: type })}
                  </h3>
                  <ul className="divide-y divide-line/5">
                    {list.map((e) => (
                      <li key={e.part.id}>
                        <MasterRow selected={e.part.id === selectedId} onClick={() => void select(e.part.id)}>
                          <span className="block truncate text-sm text-ink-strong">
                            <span className="mr-1 text-warn-400" aria-hidden="true">
                              ★
                            </span>
                            {e.part.partNo}
                          </span>
                          <span className="block truncate text-xs text-ink-faint">
                            {e.row ? (
                              <>
                                {e.part.mfr} · {describe(e.row, u, t)}
                              </>
                            ) : (
                              <span className="text-warn-200">{t('picker.savedBrokenShort')}</span>
                            )}
                          </span>
                        </MasterRow>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          }
          detail={
            selected && (
              <>
                {!selected.row && (
                  <p className="border-b border-line/10 bg-warn-500/10 px-4 py-2 text-xs leading-snug text-warn-300">
                    {t('picker.savedBroken')}
                  </p>
                )}
                <SavedPartEditor
                  // Keyed so another selection re-seeds by remounting.
                  key={selected.part.id}
                  part={selected.part}
                  onDirtyChange={onDirtyChange}
                  onDelete={() => void remove(selected)}
                  onBack={() => void select(null)}
                />
              </>
            )
          }
        />
      )}
    </MasterDetailDialog>
  );
}

function describe(row: Component, u: Units, t: (k: string, o?: Record<string, unknown>) => string): string {
  const len = (v: number) => u.fmt('length', v);
  const sym = u.sym('length');
  switch (row.type) {
    case 'parachute':
      return `⌀ ${len(row.diameter)} ${sym} · ${t('prop.dragCoeff')} ${fmtNum(row.cd ?? DEFAULT_CHUTE_CD, 2)}`;
    case 'nosecone':
      return `${t(`noseShape.${row.shape}`)} · ⌀ ${len(row.outerDiameter)} · ${len(row.length)} ${sym}`;
    case 'bulkhead':
      return `⌀ ${len(row.outerDiameter)} · ${len(row.length)} ${sym}`;
    case 'transition':
      return `${t(`noseShape.${row.shape}`)} · ⌀ ${len(row.foreOuterDiameter)} / ${len(row.aftOuterDiameter)} · ${len(row.length)} ${sym}`;
    case 'streamer':
      return `${len(row.stripLength)} × ${len(row.stripWidth)} ${sym}`;
    case 'railbutton':
      return `⌀ ${len(row.outerDiameter)}${row.innerDiameter == null ? '' : ` / ${len(row.innerDiameter)}`} · ${len(row.height)} ${sym}`;
    default:
      return `⌀ ${len(row.outerDiameter)}${
        row.innerDiameter == null ? '' : ` / ${len(row.innerDiameter)}`
      } · ${len(row.length)} ${sym}`;
  }
}
