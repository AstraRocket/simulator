import type { ReactNode } from 'react';

export function SortHeader({
  active = false,
  dir = 1,
  onSort,
  className = '',
  children,
}: {
  active?: boolean;
  dir?: 1 | -1;
  onSort?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      aria-sort={onSort ? (!active ? 'none' : dir === 1 ? 'ascending' : 'descending') : undefined}
      className={className}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          className={`inline-flex items-center gap-0.5 hover:text-ink ${active ? 'text-accent-400' : ''}`}
        >
          {children}
          {active && <span aria-hidden="true">{dir === 1 ? '▲' : '▼'}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
