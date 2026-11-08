import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ComponentNode, ComponentType, RocketTree } from '../../engine/openRocketEngine';
import { allowedChildren, findNode } from '../../services/design/treeEdit';
import { ComponentExportButton } from './ComponentExportButton';
import { useUnits, type Units } from '../../prefs/useUnits';
import { partLabel } from '../../i18n/format';
import { isFinSet } from '../../tree/tubefins';
import { token } from '../common/colorTokens';
import { toggled } from '../../services/app/collections';
import { collectNodes } from '../../tree/treeWalk';
import { useTreeNavigation, type TreeEdit } from './useTreeNavigation';
import { HiddenPartsNote, PartVisibilityToggle, type PartVisibility } from './PartVisibilityToggle';
import { isPartHidden } from './isPartHidden';

const ADD_GROUPS: { group: string; items: ComponentType[] }[] = [
  { group: 'groupBody', items: ['nosecone', 'bodytube', 'transition'] },
  { group: 'groupFins', items: ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset', 'tubefinset'] },
  { group: 'groupInner', items: ['innertube', 'tubecoupler', 'centeringring', 'bulkhead', 'engineblock'] },
  { group: 'groupRecovery', items: ['parachute', 'streamer', 'shockcord'] },
  { group: 'groupOther', items: ['launchlug', 'railbutton', 'masscomponent'] },
  { group: 'groupAssembly', items: ['podset', 'parallelstage'] },
];

// `treeitem`s, not `role="button"` rows: a button may not contain the expand toggle or export button.

// At module scope: the compiler lint reads a recursive arrow in a useMemo as a missing dependency.
function collectBranchIds(nodes: ComponentNode[]): string[] {
  return collectNodes(nodes, (n) => (n.children?.length ?? 0) > 0).map((n) => n.id as string);
}

const len = (u: Units, v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? `${u.fmtSym('length', v)}` : null;

const TYPE_COLOR: Record<string, string> = {
  stage: token('ink'),
  nosecone: token('series-1'),
  transition: token('series-1'),
  bodytube: token('series-1'),
  fairing: token('series-1'),
  trapezoidfinset: token('series-2'),
  ellipticalfinset: token('series-2'),
  freeformfinset: token('series-2'),
  tubefinset: token('series-2'),
  innertube: token('ink-muted'),
  tubecoupler: token('ink-muted'),
  centeringring: token('ink-muted'),
  bulkhead: token('ink-muted'),
  engineblock: token('ink-muted'),
  launchlug: token('series-4'),
  railbutton: token('series-4'),
  masscomponent: token('series-4'),
  parachute: token('series-3'),
  streamer: token('series-3'),
  shockcord: token('series-3'),
  podset: token('ink'),
  parallelstage: token('ink'),
};

const TYPE_SYMBOL: Record<string, string> = {
  stage: '≡',
  nosecone: '▲',
  transition: '◣',
  bodytube: '▭',
  fairing: '◗',
  trapezoidfinset: '◹',
  ellipticalfinset: '◜',
  freeformfinset: '◿',
  tubefinset: '⊚',
  innertube: '▫',
  tubecoupler: '⊟',
  centeringring: '◎',
  bulkhead: '▬',
  engineblock: '⊙',
  launchlug: '▮',
  railbutton: '▪',
  masscomponent: '◆',
  parachute: '☂',
  streamer: '≈',
  shockcord: '∿',
  podset: '◧',
  parallelstage: '❚',
};

const typeLabel = (type: string, t: TFunction): string => t(`part.${type}`, { defaultValue: type });

function detail(n: ComponentNode, t: TFunction, u: Units): string {
  const ty = n.type;
  if (ty === 'nosecone')
    return [typeof n.shape === 'string' ? t(`noseShape.${n.shape}`, { defaultValue: n.shape }) : null, len(u, n.length)]
      .filter(Boolean)
      .join(' · ');
  if (isFinSet(ty)) {
    const c = n.finCount ?? n.count;
    return typeof c === 'number' ? t('tree.fins', { count: c }) : '';
  }
  if (ty === 'parachute') {
    const d = len(u, n.diameter);
    return d ? `⌀ ${d}` : '';
  }
  if (ty === 'streamer') return len(u, n.stripLength) ?? '';
  if (ty === 'masscomponent') return typeof n.mass === 'number' ? `${u.fmtSym('mass', n.mass)}` : '';
  if (ty === 'centeringring' || ty === 'bulkhead') {
    const d = len(u, (n.outerRadius as number) * 2);
    return d ? `⌀ ${d}` : '';
  }
  return len(u, n.length) ?? '';
}

function CollapseToggle({
  id,
  isCollapsed,
  onToggle,
}: {
  id: string | undefined;
  isCollapsed: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!id) return <span className="w-6 shrink-0" aria-hidden />;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(id);
      }}
      aria-label={isCollapsed ? t('tree.expand') : t('tree.collapse')}
      tabIndex={-1}
      className="w-6 shrink-0 text-center text-xl leading-none text-ink-faint hover:text-ink"
    >
      {isCollapsed ? '▸' : '▾'}
    </button>
  );
}

function Row({
  node,
  depth,
  selectedId,
  tabbableId,
  onSelect,
  collapsed,
  onToggleCollapse,
  visibility,
}: {
  node: ComponentNode;
  depth: number;
  selectedId?: string | null;
  tabbableId?: string | null;
  onSelect?: (id: string) => void;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  visibility?: PartVisibility;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const color = TYPE_COLOR[node.type] ?? token('ink-muted');
  const symbol = TYPE_SYMBOL[node.type] ?? '□';
  const label = typeLabel(node.type, t);
  const name = partLabel(t, node);
  const isMount = node.motorMount === true;
  const det = detail(node, t, u);
  const id = typeof node.id === 'string' ? node.id : undefined;
  const selected = !!id && id === selectedId;
  const hasKids = (node.children?.length ?? 0) > 0;
  const isCollapsed = hasKids && !!id && collapsed.has(id);
  const selectable = !!id && !!onSelect;
  const rowTabIndex = selectable && id === tabbableId ? 0 : -1;
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const rowControls = selectable
    ? {
        tabIndex: id === tabbableId ? 0 : -1,
        'data-tree-row': '1',
        'data-id': id,
        onClick: () => onSelect(id),
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          // Keys on the row's own controls are theirs.
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(id);
          }
        },
      }
    : {};
  return (
    <>
      <div
        ref={rowRef}
        role="treeitem"
        aria-selected={selectable ? selected : undefined}
        aria-level={depth + 1}
        aria-expanded={hasKids && id ? !isCollapsed : undefined}
        data-haskids={hasKids && id ? '1' : undefined}
        data-collapsed={isCollapsed ? '1' : undefined}
        {...rowControls}
        className={`flex items-center gap-2 rounded-md py-1 pr-2 ${selectable ? 'cursor-pointer' : ''} ${
          selected ? 'bg-accent-600/25 ring-1 ring-inset ring-accent-500/50' : 'hover:bg-raised'
        }`}
        style={{ paddingLeft: 2 + depth * 16 }}
        title={label}
      >
        {hasKids ? (
          <CollapseToggle id={id} isCollapsed={isCollapsed} onToggle={onToggleCollapse} />
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
        <span className="w-4 shrink-0 text-center text-xs leading-none" style={{ color }} aria-hidden>
          {symbol}
        </span>
        <span
          className={`truncate text-sm ${selected ? 'text-accent-200' : 'text-ink'}`}
          style={isPartHidden(visibility, id) ? { opacity: 0.5 } : undefined}
        >
          {name}
        </span>
        {isMount && (
          <span className="shrink-0 rounded bg-accent-500/15 px-1 text-[10px] font-medium text-accent-200">
            {t('tree.motorTag')}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {det && (
            <span className={`text-[11px] tabular-nums ${selected ? 'text-ink-muted' : 'text-ink-faint'}`}>{det}</span>
          )}
          <ComponentExportButton node={node} tabIndex={rowTabIndex} />
          <PartVisibilityToggle id={id} visibility={visibility} tabIndex={rowTabIndex} />
        </div>
      </div>
      {!isCollapsed &&
        node.children?.map((c, i) => (
          <Row
            key={c.id ?? `${c.type}-${i}`}
            node={c}
            depth={depth + 1}
            selectedId={selectedId}
            tabbableId={tabbableId}
            onSelect={onSelect}
            collapsed={collapsed}
            onToggleCollapse={onToggleCollapse}
            visibility={visibility}
          />
        ))}
    </>
  );
}

function TreeToolbar({
  selectedNode,
  onAdd,
  onScale,
  onAddStage,
}: {
  selectedNode: ComponentNode | null;
  onAdd?: (type: ComponentType) => void;
  onScale?: () => void;
  onAddStage?: () => void;
}) {
  const { t } = useTranslation();
  const parentType = selectedNode?.type ?? 'stage';
  const parentLabel = typeLabel(parentType, t);
  const allowed = new Set<ComponentType>(allowedChildren(parentType));
  const groups = ADD_GROUPS.map((g) => ({ group: g.group, items: g.items.filter((ty) => allowed.has(ty)) })).filter(
    (g) => g.items.length > 0,
  );
  if (!onAdd && !onAddStage && !onScale) return null;
  // These three are about 253px wide, which sets TREE_PANE_MIN.
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {onAddStage && (
        <button
          onClick={onAddStage}
          title={t('tree.addStageTitle')}
          className="whitespace-nowrap rounded-md bg-raised px-2.5 py-1.5 text-xs font-medium text-accent-300 ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('tree.addStage')}
        </button>
      )}
      {onAdd && (
        <select
          value=""
          disabled={groups.length === 0}
          onChange={(e) => {
            const v = e.target.value as ComponentType;
            if (v) onAdd(v);
            e.currentTarget.value = '';
          }}
          className="rounded-md bg-raised px-2.5 py-1.5 text-xs font-medium text-accent-300 ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:text-ink-dim"
          title={
            groups.length ? t('tree.canHost', { parent: parentLabel }) : t('tree.cantHost', { parent: parentLabel })
          }
        >
          <option value="">{t('tree.add')}</option>
          {groups.map((g) => (
            <optgroup key={g.group} label={t(`tree.${g.group}`)}>
              {g.items.map((ty) => (
                <option key={ty} value={ty}>
                  {typeLabel(ty, t)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {onScale && (
        <button
          onClick={onScale}
          title={t('scale.title')}
          className="whitespace-nowrap rounded-md bg-raised px-2.5 py-1.5 text-xs font-medium text-accent-300 ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('tree.scale')}
        </button>
      )}
    </div>
  );
}

function TreeHeader({
  listOpen,
  onToggleList,
  selectedName,
  hasBranches,
  allCollapsed,
  toggleAll,
  edit,
}: {
  listOpen: boolean;
  onToggleList: () => void;
  selectedName: string | null;
  hasBranches: boolean;
  allCollapsed: boolean;
  toggleAll: () => void;
  edit?: TreeEdit;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-2 flex min-w-0 items-center gap-1.5">
      {/* Button inside the heading: a heading inside a button is flattened. */}
      <h2 className="flex min-w-0">
        <button
          onClick={onToggleList}
          aria-expanded={listOpen}
          title={listOpen ? t('tree.collapseTree') : t('tree.expandTree')}
          className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 hover:bg-raised"
        >
          <span className="text-base leading-none text-accent-400" aria-hidden="true">
            {listOpen ? '▾' : '▸'}
          </span>
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('tree.components')}
          </span>
          {!listOpen && selectedName && (
            <span className="truncate text-xs font-medium text-accent-300">· {selectedName}</span>
          )}
        </button>
      </h2>
      {listOpen && hasBranches && (
        <button
          onClick={toggleAll}
          title={allCollapsed ? t('tree.expandAll') : t('tree.collapseAll')}
          aria-label={allCollapsed ? t('tree.expandAll') : t('tree.collapseAll')}
          className="rounded px-1 text-xl leading-none text-ink-faint hover:bg-raised hover:text-ink"
        >
          {allCollapsed ? '⊞' : '⊟'}
        </button>
      )}
      {edit && (
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {(
            [
              // U+FE0E asks for the text glyph; without it the scissors draw as a color emoji.
              ['cut', '✂︎', edit.cut],
              ['copy', '⧉', edit.copy],
              ['paste', '⎘', edit.paste],
              ['duplicate', '❐', edit.duplicate],
            ] as const
          ).map(([key, glyph, command]) => (
            <button
              key={key}
              onClick={command.run}
              disabled={!command.enabled}
              title={command.title}
              aria-label={t(`tree.${key}`)}
              className="rounded px-1.5 py-0.5 text-sm leading-none text-ink-soft hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:text-ink-dim disabled:hover:bg-transparent"
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComponentTree({
  tree,
  selectedId,
  onSelect,
  onAdd,
  onScale,
  onAddStage,
  edit,
  visibility,
}: {
  tree: RocketTree;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onAdd?: (type: ComponentType) => void;
  onScale?: () => void;
  onAddStage?: () => void;
  edit?: TreeEdit;
  visibility?: PartVisibility;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleCollapse = (id: string) => setCollapsed((prev) => toggled(prev, id));
  const branchIds = useMemo(() => collectBranchIds(tree.components), [tree.components]);
  const allCollapsed = branchIds.length > 0 && branchIds.every((id) => collapsed.has(id));
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(branchIds));
  const { listRef, tabbableId, onTreeFocus, onTreeBlur, onTreeKeyDown } = useTreeNavigation({
    components: tree.components,
    selectedId,
    selectable: !!onSelect,
    collapsed,
    toggleCollapse,
    edit,
  });

  const [listOpen, setListOpen] = useState(true);
  const selectedNode = selectedId ? findNode(tree, selectedId) : null;
  const selectedName = selectedNode ? partLabel(t, selectedNode) : null;

  return (
    <section className="rounded-xl bg-surface p-2 ring-1 ring-line/10">
      <TreeToolbar selectedNode={selectedNode} onAdd={onAdd} onScale={onScale} onAddStage={onAddStage} />
      <TreeHeader
        listOpen={listOpen}
        onToggleList={() => setListOpen((o) => !o)}
        selectedName={selectedName}
        hasBranches={branchIds.length > 0}
        allCollapsed={allCollapsed}
        toggleAll={toggleAll}
        edit={edit}
      />
      {listOpen && (
        <div // eslint-disable-line jsx-a11y-x/interactive-supports-focus -- roving tabindex: the selected row is the tab stop, as in the ARIA tree pattern, so the container is not
          ref={listRef}
          role="tree"
          aria-label={t('tree.components')}
          onKeyDown={onTreeKeyDown}
          onFocus={onTreeFocus}
          onBlur={onTreeBlur}
          className="border-l border-line/5"
        >
          {tree.components.length ? (
            tree.components.map((c, i) => (
              <Row
                key={(c.id as string) ?? `${c.type}-${i}`}
                node={c}
                depth={0}
                selectedId={selectedId}
                tabbableId={tabbableId}
                onSelect={onSelect}
                collapsed={collapsed}
                onToggleCollapse={toggleCollapse}
                visibility={visibility}
              />
            ))
          ) : (
            <p className="px-2 py-1 text-sm text-ink-faint">{t('tree.noComponents')}</p>
          )}
        </div>
      )}
      {visibility && <HiddenPartsNote visibility={visibility} />}
    </section>
  );
}
