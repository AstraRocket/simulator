const SIZE = {
  tight: 'px-2 py-0.5 text-[11px]',
  chip: 'px-2 py-1 text-[11px]',
  xs: 'px-2 py-1 text-xs',
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

/** `extra` is layout only, never another color or size (conflicting utilities resolve by stylesheet order). */
export function smallButton(size: keyof typeof SIZE, tone: keyof typeof TONE, extra = ''): string {
  return `rounded-md bg-raised ${SIZE[size]} font-medium ${TONE[tone]} ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50${extra ? ` ${extra}` : ''}`;
}
