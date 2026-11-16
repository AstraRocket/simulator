import type { ComponentProps, ReactNode } from 'react';

export const STACKED_INPUT =
  'w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink-strong ring-1 ring-line/10 focus:ring-accent-500';
export const STACKED_LABEL = 'mt-4 block text-xs font-medium text-ink-muted';

/** A label over a full-width text box, as in the editors' and dialogs' forms. */
export function StackedField({
  id,
  label,
  labelClassName = STACKED_LABEL,
  ...input
}: { id: string; label: ReactNode; labelClassName?: string } & Omit<ComponentProps<'input'>, 'id' | 'className'>) {
  return (
    <>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <input id={id} {...input} className={`mt-1 ${STACKED_INPUT}`} />
    </>
  );
}
