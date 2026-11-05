/** Renders `<dt>`/`<dd>`, so it must sit inside a `<dl>`. */
export function TermRow({
  label,
  children,
  detail,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums text-ink-strong">{children}</dd>
      {detail !== undefined && <dd className="tabular-nums text-ink-soft">{detail}</dd>}
    </div>
  );
}
