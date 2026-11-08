export function ToolBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-line/10 disabled:cursor-not-allowed disabled:text-ink-dim ${
        danger ? 'bg-raised text-danger-300 hover:bg-elevated' : 'bg-raised text-accent-300 hover:bg-elevated'
      }`}
    >
      {children}
    </button>
  );
}
