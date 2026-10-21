// cspell:ignore matedtpan -- desktop's MaterialEditPanel message keys
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm } from '../../state/confirmStore';
import { fireAction } from '../../state/fireAction';
import { useWorkspaceStore } from '../../state/store';
import { errorText } from '../../i18n/keyedError';
import { partLabel } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { documentMaterialsOf, byNameThenDensity } from '../../services/materials/documentMaterials';
import {
  builtinsForType,
  customMaterialsVersion,
  groupsOf,
  listCustom,
  onCustomMaterialsChanged,
} from '../../services/materials/materials';
import type { Material, MaterialType } from '../../services/materials/materialTypes';
import { partsUsing } from '../../services/materials/materialEdits';
import {
  deleteAllMaterials,
  deleteMaterial,
  saveMaterial,
  type DesignAccess,
  type ScopedMaterial,
} from '../../services/materials/myMaterials';
import { Dialog } from '../common/Dialog';
import { MasterDetail, MasterRow, MasterStatus, useGuardedSelection } from '../common/MasterDetail';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { MaterialEditor } from './MaterialEditor';
import { QUANTITY } from './materialUnits';

const TYPES: MaterialType[] = ['bulk', 'surface', 'line'];

/** The selection token for the material being created, which has no key yet. */
const NEW = 'new';

const keyOf = (m: ScopedMaterial): string => JSON.stringify([m.scope, m.type, m.name, m.density]);

/** The open design as Custom Materials reads and changes it: each change one undo step. */
const design: DesignAccess = {
  tree: () => useWorkspaceStore.getState().tree,
  apply: (change) => useWorkspaceStore.getState().applyTreeAction((tree) => change(tree)),
};

/**
 * Every material the user defined, in one place: desktop's material manager
 * (Preferences ▸ Custom materials, `MaterialEditPanel`) as a list beside an
 * editor, the way Custom Parts and Launch Locations are built.
 *
 * Two lists, as desktop's Scope column has two values: the open design's own
 * materials, which are saved in its `.ork`, and the user's custom materials in
 * this browser, which every design is offered. The built-in materials are not
 * listed: none of them can be changed or deleted, and every part's picker
 * already offers them.
 *
 * What a save or a delete does to the design's parts follows desktop; see
 * services/materials/myMaterials.ts.
 */
export function MyMaterialsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const version = useSyncExternalStore(onCustomMaterialsChanged, customMaterialsVersion, customMaterialsVersion);
  const library = useAsyncLoad(listCustom, 'custom', { refresh: version });
  const builtins = useAsyncLoad(() => Promise.all(TYPES.map(builtinsForType)), 'builtins');
  const [err, setErr] = useState<string | null>(null);
  const {
    selectedId,
    select: guardedSelect,
    settle,
    close: guardedClose,
    onDirtyChange,
  } = useGuardedSelection(t('myMaterials.discardConfirm'));

  const designList = useMemo<ScopedMaterial[]>(
    () =>
      documentMaterialsOf(tree)
        .sort(byNameThenDensity)
        .map((m) => ({ ...m, group: m.group ?? '', scope: 'design' })),
    [tree],
  );
  const libraryList = useMemo<ScopedMaterial[]>(
    () =>
      (library.data ?? [])
        .map((m) => ({ name: m.name, type: m.type, density: m.density, group: m.group, scope: 'library' as const }))
        .sort(byNameThenDensity),
    [library.data],
  );

  const creating = selectedId === NEW;
  const selected = creating ? null : ([...designList, ...libraryList].find((m) => keyOf(m) === selectedId) ?? null);
  const showsDetail = creating || selected !== null;

  /** Groups a material of a type can be filed under: the catalog's and the user's own. */
  const groups = (type: MaterialType): string[] => {
    const all: Material[] = [...(builtins.data ?? []).flat(), ...(library.data ?? [])];
    return groupsOf(all.filter((m) => m.type === type));
  };

  const select = async (id: string | null) => {
    if (await guardedSelect(id)) setErr(null);
  };

  const save = async (draft: ScopedMaterial): Promise<string | null> => {
    try {
      await saveMaterial(design, selected, draft);
    } catch (e) {
      return errorText(e, t);
    }
    // Stay on what was written, as Custom Parts does. A name or density edit moves
    // the entry, so the selection follows it.
    settle(keyOf({ ...draft, name: draft.name.trim() }));
    return null;
  };

  const remove = async (m: ScopedMaterial) => {
    const users = partsUsing(tree, m);
    if (m.scope === 'design' && users.length) {
      // Desktop refuses, naming the parts (matedtpan.dlg.RemoveUsedMaterial.Document).
      setErr(t('myMaterials.deleteRefused', { name: m.name, parts: users.map((n) => partLabel(t, n)).join(', ') }));
      return;
    }
    const ok = await confirm({
      message:
        m.scope === 'library' && users.length
          ? t('myMaterials.deleteKeepsInDesign', { name: m.name })
          : t('myMaterials.deleteConfirm', { name: m.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    try {
      await deleteMaterial(design, m);
      settle(null);
    } catch (e) {
      setErr(errorText(e, t));
    }
  };

  const removeAll = async () => {
    const ok = await confirm({
      message: t('myMaterials.deleteAllConfirm'),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    try {
      await deleteAllMaterials(design);
      settle(null);
    } catch (e) {
      setErr(errorText(e, t));
    }
  };

  const empty = designList.length === 0 && libraryList.length === 0;
  const actionClass =
    'rounded-md bg-raised px-2 py-1 text-xs font-medium text-ink ring-1 ring-line/10 hover:bg-elevated disabled:opacity-50';

  return (
    <Dialog
      id="myMaterials"
      title={t('myMaterials.title')}
      onClose={() => fireAction(guardedClose(onClose))}
      size="4xl"
      layout="fill"
      height={720}
      actions={
        <div className="flex gap-2">
          <button onClick={() => void select(NEW)} className={actionClass}>
            {t('myMaterials.new')}
          </button>
          {/* Desktop's "Revert all": every material the user defined, in both lists. */}
          <button onClick={() => void removeAll()} disabled={empty} className={actionClass}>
            {t('myMaterials.deleteAll')}
          </button>
        </div>
      }
      footer={<MasterStatus err={err ?? library.error} />}
    >
      {library.loading && !library.data ? (
        <p className="grid flex-1 place-items-center p-6 text-sm text-ink-muted">{t('common.loading')}</p>
      ) : (
        <MasterDetail
          showsDetail={showsDetail}
          hint={t('myMaterials.pickHint')}
          list={
            empty ? (
              // Reachable from the menu before anything is defined, so it says
              // where custom materials come from rather than show a void.
              <p className="p-6 text-center text-sm leading-snug text-ink-muted">{t('myMaterials.empty')}</p>
            ) : (
              <>
                <Section title={t('material.inDesign')} list={designList} selectedId={selectedId} onSelect={select} />
                <Section
                  title={t('myMaterials.inBrowser')}
                  list={libraryList}
                  selectedId={selectedId}
                  onSelect={select}
                />
              </>
            )
          }
          detail={
            <MaterialEditor
              key={selectedId ?? NEW}
              material={selected}
              groups={groups}
              usedBy={selected ? partsUsing(tree, selected).map((n) => partLabel(t, n)) : []}
              onSave={save}
              onDelete={selected ? () => void remove(selected) : undefined}
              onDirtyChange={onDirtyChange}
              onBack={() => void select(null)}
            />
          }
        />
      )}
    </Dialog>
  );
}

/** One scope's materials, or nothing when it has none. */
function Section({
  title,
  list,
  selectedId,
  onSelect,
}: {
  title: string;
  list: ScopedMaterial[];
  selectedId: string | null;
  onSelect: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  if (!list.length) return null;
  return (
    <section>
      <h3 className="sticky top-0 bg-surface px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      <ul className="divide-y divide-line/5">
        {list.map((m) => {
          const fu = u.at(unitScope('material', m.type), QUANTITY[m.type]);
          return (
            <li key={keyOf(m)}>
              <MasterRow selected={keyOf(m) === selectedId} onClick={() => void onSelect(keyOf(m))}>
                <span className="block truncate text-sm text-ink-strong">{m.name}</span>
                <span className="block truncate text-xs tabular-nums text-ink-faint">
                  {t(`myMaterials.type.${m.type}`)} · {fu.fmtSym(m.density)}
                </span>
              </MasterRow>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
