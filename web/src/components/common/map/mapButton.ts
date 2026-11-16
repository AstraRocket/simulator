/** A button floating on a map, filled while its choice or panel is on. */
export const mapButtonClass = (active: boolean): string =>
  `px-2 py-1 text-[11px] font-medium ${
    active ? 'bg-accent-600 text-on-accent' : 'bg-surface/80 text-ink-soft hover:bg-raised'
  }`;
