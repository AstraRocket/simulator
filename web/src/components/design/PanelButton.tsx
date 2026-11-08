import type { ButtonHTMLAttributes } from 'react';

export function PanelButton({ className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`rounded-md bg-raised px-2 py-1 text-xs text-ink-soft ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:text-ink-dim disabled:hover:bg-raised ${className}`}
      {...rest}
    />
  );
}
