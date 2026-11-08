import type { ReactNode } from 'react';

export function PropSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-line/5 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}
