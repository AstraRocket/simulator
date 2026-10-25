const SIZE = {
  /** Inline in a table row or a figure caption. */
  tight: 'px-2 py-0.5 text-[11px]',
  /** A chart's or a table's header action. */
  chip: 'px-2 py-1 text-[11px]',
  xs: 'px-2 py-1 text-xs',
  /** A full-width or paired action in a side panel. */
  row: 'px-2 py-1.5 text-xs',
  sm: 'px-3 py-1.5 text-xs',
} as const;

const TONE = {
  ink: 'text-ink',
  soft: 'text-ink-soft',
  muted: 'text-ink-muted',
  accent: 'text-accent-300',
  warn: 'text-warn-300',
} as const;

/**
 * The classes of the small secondary button: a raised chip with a hairline
 * ring, for the actions beside a form or a chart rather than a dialog's own
 * footer (that is `DialogButton`). A class string rather than a component so a
 * `<label>` over a file input or a link can wear it too. `extra` is layout
 * only (`w-full`, `shrink-0`), never another color or size.
 */
export function smallButton(size: keyof typeof SIZE, tone: keyof typeof TONE, extra = ''): string {
  return `rounded-md bg-raised ${SIZE[size]} font-medium ${TONE[tone]} ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50${extra ? ` ${extra}` : ''}`;
}
