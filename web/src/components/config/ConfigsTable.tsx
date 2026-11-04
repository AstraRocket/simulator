import { useTranslation } from 'react-i18next';
import type { ComponentNode, RocketTree } from '../../engine/openRocketEngine';
import { configLabel, type FlightConfig } from '../../services/flight/flightConfigs';

export interface ConfigColumn {
  id: string;
  label: string;
  cell: (config: FlightConfig) => React.ReactNode;
}

export function ConfigsTable({
  configs,
  tree,
  columns,
  selectedId,
  flights,
  onSelect,
}: {
  configs: FlightConfig[];
  tree: RocketTree;
  columns: ConfigColumn[];
  selectedId: string;
  flights: Record<string, number>;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <table aria-label={t('configs.title')} className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line/10 text-[11px] uppercase tracking-wide text-ink-muted">
          <th scope="col" className="px-2 py-2 text-left font-semibold">
            {t('configs.name')}
          </th>
          {columns.map((col) => (
            <th key={col.id} scope="col" className="hidden px-2 py-2 text-left font-semibold lg:table-cell">
              {col.label}
            </th>
          ))}
          <th scope="col" className="px-2 py-2 text-right font-semibold">
            {t('configs.flights')}
          </th>
        </tr>
      </thead>
      <tbody>
        {configs.map((c) => {
          const label = configLabel(tree, c);
          return (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`cursor-pointer border-b border-line/5 ${
                c.id === selectedId ? 'bg-accent-950/40' : 'hover:bg-raised/50'
              }`}
            >
              <td className="px-2 py-2">
                {/* The row click is for pointers; this button is for keyboards and screen readers. */}
                <button
                  onClick={() => onSelect(c.id)}
                  aria-current={c.id === selectedId ? 'true' : undefined}
                  className={`text-left ${c.id === selectedId ? 'font-semibold text-accent-300' : 'text-ink'}`}
                >
                  {label || <span className="text-ink-faint">{t('configs.noMotors')}</span>}
                </button>
              </td>
              {columns.map((col) => (
                <td key={col.id} className="hidden px-2 py-2 text-ink-muted lg:table-cell">
                  {col.cell(c)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{flights[c.id] ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function partName(
  node: ComponentNode,
  i: number,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  const own = typeof node.name === 'string' ? node.name.trim() : '';
  return own || t('configs.partNumbered', { part: t(`part.${node.type}`), n: i + 1 });
}
