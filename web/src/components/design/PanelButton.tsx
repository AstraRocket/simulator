import type { ButtonHTMLAttributes } from 'react';

/**
 * An action button in the property panel (move, auto fin tab, apply the
 * scale). A disabled one dims its text and keeps its fill, so a row of them
 * keeps its shape while one is unavailable. `className` is layout only.
 */
export function PanelButton({ className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`rounded-md bg-raised px-2 py-1 text-xs text-ink-soft ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:text-ink-dim disabled:hover:bg-raised ${className}`}
      {...rest}
    />
  );
}
