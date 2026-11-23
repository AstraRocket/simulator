import { useMemo, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { smallButton } from '../common/smallButton';
import { useUnits } from '../../prefs/useUnits';
import { partGlyph } from '../design/partGlyph';
import { rangeFloor, type OptParam } from '../../services/flight/optimizer/optParams';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { numCls, PARAM_LABEL, paramName, paramUnit, show, useNodeNames } from './optimizerFigures';

/** A parameter in the list to optimize, with the range the search keeps to. */
export interface ParamPick {
  id: string;
  min: number;
  max: number;
}

/** A click picks one; Ctrl or Cmd adds to or takes from the picked set. */
function clickPick(prev: ReadonlySet<string>, id: string, e: MouseEvent): Set<string> {
  if (!(e.ctrlKey || e.metaKey)) return new Set([id]);
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Desktop's parameter chooser: the parts tree with each part's parameters under it, added to the list to optimize
 * by a double click or the Add button, and the list with each parameter's range.
 */
export function OptParamPicker({
  tree,
  params,
  picks,
  setPicks,
  disabled,
}: {
  tree: RocketTree;
  params: OptParam[];
  picks: ParamPick[];
  setPicks: (next: ParamPick[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const nodeNames = useNodeNames(tree, t);
  const [treeSel, setTreeSel] = useState<ReadonlySet<string>>(() => new Set());
  const [rowSel, setRowSel] = useState<ReadonlySet<string>>(() => new Set());
  const chosen = new Set(picks.map((p) => p.id));
  const byId = useMemo(() => new Map(params.map((p) => [p.id, p])), [params]);

  const add = (ids: Iterable<string>) => {
    const fresh = [...ids].filter((id) => !chosen.has(id) && byId.has(id));
    if (!fresh.length) return;
    setPicks([
      ...picks,
      ...fresh.map((id) => {
        const p = byId.get(id) as OptParam;
        return { id, min: p.min, max: p.max };
      }),
    ]);
  };
  const remove = (ids: ReadonlySet<string>) => {
    setPicks(picks.filter((p) => !ids.has(p.id)));
    setRowSel(new Set());
  };

  const canAdd = [...treeSel].some((id) => !chosen.has(id));
  const btn = `${smallButton('sm', 'soft')} disabled:cursor-not-allowed disabled:opacity-50`;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <SelectedTable
        params={byId}
        picks={picks}
        setPicks={setPicks}
        nodeNames={nodeNames}
        rowSel={rowSel}
        setRowSel={setRowSel}
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => add(treeSel)} disabled={disabled || !canAdd} className={btn}>
          {t('optimize.add')}
        </button>
        <button onClick={() => remove(rowSel)} disabled={disabled || rowSel.size === 0} className={btn}>
          {t('optimize.remove')}
        </button>
        <button onClick={() => remove(chosen)} disabled={disabled || picks.length === 0} className={btn}>
          {t('optimize.removeAll')}
        </button>
      </div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {t('optimize.availableHeading')}
      </h3>
      <p className="text-ink-faint">{t('optimize.treeHint')}</p>
      <ul
        aria-label={t('optimize.availableHeading')}
        className="max-h-96 min-h-48 overflow-y-auto rounded-md bg-surface p-1 ring-1 ring-line/10 md:max-h-none md:flex-1"
      >
        {tree.components.map((n, i) => (
          <PartBranch
            key={n.id ?? i}
            node={n}
            depth={0}
            params={params}
            nodeNames={nodeNames}
            chosen={chosen}
            treeSel={treeSel}
            onPick={(id, e) => setTreeSel((prev) => clickPick(prev, id, e))}
            onAdd={(id) => add([id])}
            disabled={disabled}
          />
        ))}
      </ul>
    </div>
  );
}

function PartBranch({
  node,
  depth,
  params,
  nodeNames,
  chosen,
  treeSel,
  onPick,
  onAdd,
  disabled,
}: {
  node: ComponentNode;
  depth: number;
  params: OptParam[];
  nodeNames: Map<string, string>;
  chosen: ReadonlySet<string>;
  treeSel: ReadonlySet<string>;
  onPick: (id: string, e: MouseEvent) => void;
  onAdd: (id: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  // Desktop opens the parts and leaves a part's parameter group shut when it also has parts under it.
  const [groupOpen, setGroupOpen] = useState(false);
  const id = node.id;
  const own = params.filter((p) => p.nodeId === id);
  const kids = node.children ?? [];
  const { symbol, color } = partGlyph(node.type);
  const indent = (d: number) => ({ paddingLeft: 4 + d * 16 });

  const leaves = (d: number) =>
    own.map((p) => {
      const taken = chosen.has(p.id);
      const picked = treeSel.has(p.id);
      return (
        <li key={p.id}>
          <button
            type="button"
            aria-pressed={picked}
            disabled={disabled}
            onClick={(e) => onPick(p.id, e)}
            onDoubleClick={() => onAdd(p.id)}
            title={taken ? t('optimize.alreadyAdded') : undefined}
            className={`flex w-full items-center rounded py-0.5 pr-2 text-left ${
              picked ? 'bg-accent-600/25 ring-1 ring-inset ring-accent-500/50' : 'hover:bg-raised'
            } ${taken ? 'text-ink-dim' : 'font-semibold text-ink-strong'}`}
            style={indent(d)}
          >
            {t(PARAM_LABEL[p.key])}
          </button>
        </li>
      );
    });

  return (
    <li>
      <div className="flex items-center gap-2 py-0.5 italic text-ink-faint" style={indent(depth)}>
        <span className="w-4 shrink-0 text-center not-italic leading-none" style={{ color }} aria-hidden>
          {symbol}
        </span>
        <span className="truncate">{(id && nodeNames.get(id)) ?? t(`part.${node.type}`)}</span>
      </div>
      {(own.length > 0 || kids.length > 0) && (
        <ul>
          {own.length > 0 && kids.length > 0 ? (
            <li>
              <button
                type="button"
                aria-expanded={groupOpen}
                onClick={() => setGroupOpen((o) => !o)}
                className="flex w-full items-center gap-1 rounded py-0.5 text-left text-ink-faint hover:bg-raised"
                style={indent(depth + 1)}
              >
                <span aria-hidden className="w-3 text-center">
                  {groupOpen ? '▾' : '▸'}
                </span>
                {t('optimize.paramGroup')}
              </button>
              {groupOpen && <ul>{leaves(depth + 2)}</ul>}
            </li>
          ) : (
            leaves(depth + 1)
          )}
          {kids.map((c, i) => (
            <PartBranch
              key={c.id ?? i}
              node={c}
              depth={depth + 1}
              params={params}
              nodeNames={nodeNames}
              chosen={chosen}
              treeSel={treeSel}
              onPick={onPick}
              onAdd={onAdd}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SelectedTable({
  params,
  picks,
  setPicks,
  nodeNames,
  rowSel,
  setRowSel,
  disabled,
}: {
  params: Map<string, OptParam>;
  picks: ParamPick[];
  setPicks: (next: ParamPick[]) => void;
  nodeNames: Map<string, string>;
  rowSel: ReadonlySet<string>;
  setRowSel: (next: ReadonlySet<string>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const th = 'px-2 py-1.5 font-medium';
  const patch = (id: string, next: Partial<ParamPick>) =>
    setPicks(picks.map((p) => (p.id === id ? { ...p, ...next } : p)));
  return (
    <div className="max-h-60 shrink-0 overflow-auto">
      <table className="w-full tabular-nums">
        <caption className="mb-1 text-left text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('optimize.paramsHeading')}
        </caption>
        <thead className="text-ink-muted">
          <tr>
            <th scope="col" className={`${th} w-6`}>
              <span className="sr-only">{t('optimize.colSelect')}</span>
            </th>
            <th scope="col" className={`${th} text-left`}>
              {t('optimize.colParam')}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t('optimize.colCurrent')}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t('optimize.colMin')}
            </th>
            <th scope="col" className={`${th} text-right`}>
              {t('optimize.colMax')}
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">{t('optimize.colUnit')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {!picks.length && (
            <tr className="border-t border-line/5">
              <td colSpan={6} className="px-2 py-2 text-ink-faint">
                {t('optimize.noneAdded')}
              </td>
            </tr>
          )}
          {picks.map((pick) => {
            const p = params.get(pick.id);
            if (!p) return null;
            const c = paramUnit(u, p, t);
            const name = paramName(p, nodeNames, t);
            const floor = rangeFloor(p);
            const edge = (key: 'min' | 'max') => (
              <NumberInput
                value={c.toUi(pick[key])}
                onChange={(v) => {
                  if (v == null) return;
                  const si = c.toSi(v);
                  patch(p.id, { [key]: floor != null ? Math.max(floor, si) : si });
                }}
                disabled={disabled}
                ariaLabel={`${name} ${key === 'min' ? t('optimize.colMin') : t('optimize.colMax')}`}
                invalid={!(pick.max > pick.min)}
                className={numCls}
              />
            );
            return (
              <tr key={p.id} className="border-t border-line/5">
                <td className="px-2 py-1">
                  <input
                    type="checkbox"
                    checked={rowSel.has(p.id)}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = new Set(rowSel);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setRowSel(next);
                    }}
                    aria-label={t('optimize.selectNamed', { name })}
                    className="accent-accent-500 disabled:opacity-30"
                  />
                </td>
                <th scope="row" className="px-2 py-1 text-left font-normal text-ink-strong">
                  {name}
                </th>
                <td className="px-2 py-1 text-right">{show(c, p.current)}</td>
                <td className="px-2 py-1 text-right">{edge('min')}</td>
                <td className="px-2 py-1 text-right">{edge('max')}</td>
                <td className="px-2 py-1 text-[10px] text-ink-faint">{c.sym}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
