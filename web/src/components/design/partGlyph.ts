import { token } from '../common/colorTokens';

const TYPE_COLOR: Record<string, string> = {
  stage: token('ink'),
  nosecone: token('series-1'),
  transition: token('series-1'),
  bodytube: token('series-1'),
  fairing: token('series-1'),
  trapezoidfinset: token('series-2'),
  ellipticalfinset: token('series-2'),
  freeformfinset: token('series-2'),
  tubefinset: token('series-2'),
  innertube: token('ink-muted'),
  tubecoupler: token('ink-muted'),
  centeringring: token('ink-muted'),
  bulkhead: token('ink-muted'),
  engineblock: token('ink-muted'),
  launchlug: token('series-4'),
  railbutton: token('series-4'),
  masscomponent: token('series-4'),
  parachute: token('series-3'),
  streamer: token('series-3'),
  shockcord: token('series-3'),
  podset: token('ink'),
  parallelstage: token('ink'),
};

const TYPE_SYMBOL: Record<string, string> = {
  stage: '≡',
  nosecone: '▲',
  transition: '◣',
  bodytube: '▭',
  fairing: '◗',
  trapezoidfinset: '◹',
  ellipticalfinset: '◜',
  freeformfinset: '◿',
  tubefinset: '⊚',
  innertube: '▫',
  tubecoupler: '⊟',
  centeringring: '◎',
  bulkhead: '▬',
  engineblock: '⊙',
  launchlug: '▮',
  railbutton: '▪',
  masscomponent: '◆',
  parachute: '☂',
  streamer: '≈',
  shockcord: '∿',
  podset: '◧',
  parallelstage: '❚',
};

/** The symbol and color a part type wears in a component tree. */
export function partGlyph(type: string): { symbol: string; color: string } {
  return { symbol: TYPE_SYMBOL[type] ?? '□', color: TYPE_COLOR[type] ?? token('ink-muted') };
}
