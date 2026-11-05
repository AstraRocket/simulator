import type { ReactNode } from 'react';

// Strings are OpenRocket's own (see `engine-java/ATTRIBUTION.md`).
// Markup goes through a three-tag whitelist, not `dangerouslySetInnerHTML`, so vendored text cannot inject.

const TAG = /<(\/?)(b|i|sup)>/gi;

export function richText(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const open: { tag: string; kids: ReactNode[] }[] = [];
  const push = (n: ReactNode) => (open.length ? open[open.length - 1]!.kids : out).push(n);
  let last = 0;
  let key = 0;
  for (const m of src.matchAll(TAG)) {
    if (m.index > last) push(src.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[2]!.toLowerCase();
    if (m[1]) {
      // A stray close tag is text, not a crash.
      const top = open[open.length - 1];
      if (!top || top.tag !== tag) continue;
      open.pop();
      const El = tag as 'b' | 'i' | 'sup';
      push(<El key={key++}>{top.kids}</El>);
    } else {
      open.push({ tag, kids: [] });
    }
  }
  if (last < src.length) push(src.slice(last));
  // An unclosed tag keeps its contents rather than dropping them.
  for (let top = open.pop(); top; top = open.pop()) {
    (open.length ? open[open.length - 1]!.kids : out).push(...top.kids);
  }
  return out;
}
