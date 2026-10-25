import type { ButtonHTMLAttributes, ReactNode } from 'react';

const VARIANT = {
  primary: 'bg-accent-600 text-on-accent hover:bg-accent-700',
  secondary: 'bg-raised text-ink ring-1 ring-line/10 hover:bg-elevated',
  danger: 'bg-danger-600 text-on-accent hover:bg-danger-500',
} as const;

/**
 * A dialog's action button: the Cancel (`secondary`), the OK (`primary`) and the
 * destructive confirm (`danger`). One component, so a dialog's buttons look the
 * same as every other dialog's, and a disabled primary reads the same everywhere
 * rather than four different ways.
 */
/** `md` for a dialog's own footer, `sm` for a compact row (a pane footer, a popover). */
const SIZE = { md: 'px-4 py-2', sm: 'px-3 py-1.5' } as const;

export function DialogButton({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; size?: keyof typeof SIZE }) {
  return (
    <button
      type={type}
      className={`rounded-lg ${SIZE[size]} text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

/**
 * A dialog's row of action buttons, right-aligned under its content: for a
 * dialog laid out with `layout="pad"`, which leaves its footer to the caller.
 * One component, so every such dialog spaces its buttons alike.
 */
export function DialogActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mt-5 flex flex-wrap justify-end gap-2 ${className}`}>{children}</div>;
}
