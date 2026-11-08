/** Replaces rather than appends: two `ring-*` utilities resolve by stylesheet order, not string order. */
export const markRing = (cls: string, missing?: boolean, mixed?: boolean): string =>
  missing
    ? cls.replace('ring-line/10', 'ring-danger-500/70')
    : mixed
      ? cls.replace('ring-line/10', 'ring-warn-500/60')
      : cls;
