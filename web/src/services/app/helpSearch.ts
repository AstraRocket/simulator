import { type HelpEntry, fetchHelpDocument, headingLabel, helpTarget, pageTitle, splitPage } from './helpDocs';

export interface HelpSection {
  hash: string;
  heading: string;
  text: string;
}

export interface HelpDoc {
  slug: string;
  label: string;
  title: string;
  sections: HelpSection[];
}

export interface HelpHit {
  page: string;
  label: string;
  heading: string;
  snippet: string;
  score: number;
}

const HIT_LIMIT = 60;

const SNIPPET_CHARS = 170;

/** Must stay index-for-index with its input: match indices are reused on the original. */
export function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    // Astral characters are two UTF-16 units; folding to one would shift indices.
    if (ch.length !== 1) {
      out += ch;
      continue;
    }
    const base = ch.normalize('NFD')[0] ?? ch;
    const low = base.toLowerCase();
    out += low.length === 1 ? low : ch;
  }
  return out;
}

export function searchTokens(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export function readSections(doc: Document): HelpSection[] {
  const root = doc.querySelector('.theme-doc-markdown');
  if (!root) return [];

  const sections: HelpSection[] = [{ hash: '', heading: '', text: '' }];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if ((el.tagName === 'H2' || el.tagName === 'H3') && el.id) {
        sections.push({ hash: `#${el.id}`, heading: headingLabel(el), text: '' });
      }
      continue;
    }
    // Heading text is already held as the heading; taking it again doubles its score.
    if (node.parentElement?.closest('h1, h2, h3')) continue;
    const at = sections[sections.length - 1]!;
    at.text += node.nodeValue ?? '';
  }

  for (const section of sections) section.text = collapse(section.text);
  return sections.filter((section) => section.heading !== '' || section.text !== '');
}

const INDEXES = new Map<string, Promise<HelpDoc[]>>();

export function resetHelpIndex(): void {
  INDEXES.clear();
}

async function buildIndex(pages: HelpEntry[], language: string): Promise<HelpDoc[]> {
  // Category rows point at their first child; taking them would index it twice.
  const slugs = new Map<string, string>();
  for (const entry of pages) {
    if (entry.page === null) continue;
    const { slug } = splitPage(entry.page);
    if (!slugs.has(slug)) slugs.set(slug, entry.label);
  }

  const docs = await Promise.all(
    [...slugs].map(async ([slug, label]): Promise<HelpDoc | null> => {
      const doc = await fetchHelpDocument(helpTarget(slug, language).fileUrl);
      if (!doc) return null;
      const sections = readSections(doc);
      if (!sections.length) return null;
      return { slug, label, title: pageTitle(doc) ?? label, sections };
    }),
  );
  return docs.filter((doc): doc is HelpDoc => doc !== null);
}

/** An empty build is not kept: a cold-cache offline search looks the same. */
export function helpIndex(pages: HelpEntry[], language: string): Promise<HelpDoc[]> {
  const cached = INDEXES.get(language);
  if (cached) return cached;
  const built = buildIndex(pages, language).then((docs) => {
    if (!docs.length) INDEXES.delete(language);
    return docs;
  });
  INDEXES.set(language, built);
  return built;
}

function firstMatch(folded: string, tokens: string[]): number {
  let at = -1;
  for (const token of tokens) {
    const i = folded.indexOf(token);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  return at;
}

function backToWord(text: string, i: number): number {
  const space = text.lastIndexOf(' ', i);
  return space < 0 ? 0 : space + 1;
}

export function snippetAround(text: string, tokens: string[]): string {
  if (text.length <= SNIPPET_CHARS) return text;
  const at = firstMatch(fold(text), tokens);
  if (at < 0) return `${text.slice(0, backToWord(text, SNIPPET_CHARS)).trimEnd()}…`;

  const start = backToWord(text, Math.max(0, at - Math.floor(SNIPPET_CHARS / 3)));
  const end = start + SNIPPET_CHARS;
  const cut = end >= text.length ? text.length : backToWord(text, end) - 1;
  return `${start > 0 ? '…' : ''}${text.slice(start, cut).trim()}${cut < text.length ? '…' : ''}`;
}

export function searchHelp(docs: HelpDoc[], query: string, limit = HIT_LIMIT): HelpHit[] {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  const phrase = fold(query.trim());

  const hits: HelpHit[] = [];
  for (const doc of docs) {
    const titleHay = fold(`${doc.title} ${doc.label}`);
    for (const section of doc.sections) {
      const headHay = fold(section.heading);
      const bodyHay = fold(section.text);
      let score = 0;
      let all = true;
      for (const token of tokens) {
        const inHead = headHay.includes(token);
        const inBody = bodyHay.includes(token);
        const inTitle = titleHay.includes(token);
        if (!inHead && !inBody && !inTitle) {
          all = false;
          break;
        }
        score += (inHead ? 4 : 0) + (inBody ? 2 : 0) + (inTitle ? 1 : 0);
      }
      if (!all) continue;
      if (tokens.length > 1) {
        if (headHay.includes(phrase)) score += 8;
        else if (bodyHay.includes(phrase)) score += 4;
      }
      hits.push({
        page: `${doc.slug}${section.hash}`,
        label: doc.label,
        heading: section.heading,
        snippet: snippetAround(section.text, tokens),
        score,
      });
    }
  }

  return hits
    .map((hit, i) => ({ hit, i }))
    .sort((a, b) => b.hit.score - a.hit.score || a.i - b.i)
    .slice(0, limit)
    .map(({ hit }) => hit);
}

export interface HelpSegment {
  text: string;
  hit: boolean;
}

export function splitHighlight(text: string, tokens: string[]): HelpSegment[] {
  if (!tokens.length) return [{ text, hit: false }];
  const folded = fold(text);
  const out: HelpSegment[] = [];
  let at = 0;
  let plain = 0;
  while (at < text.length) {
    // Longest token here, so "fin fins" does not cut the longer match short.
    let len = 0;
    for (const token of tokens) {
      if (token.length > len && folded.startsWith(token, at)) len = token.length;
    }
    if (!len) {
      at += 1;
      continue;
    }
    if (at > plain) out.push({ text: text.slice(plain, at), hit: false });
    out.push({ text: text.slice(at, at + len), hit: true });
    at += len;
    plain = at;
  }
  if (plain < text.length) out.push({ text: text.slice(plain), hit: false });
  return out;
}

const MARK_ATTR = 'data-astra-help-mark';

export function markMatches(root: Element, tokens: string[]): HTMLElement[] {
  if (!tokens.length) return [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // Collected first: a live walk would step into the inserted marks.
  const texts: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue?.trim()) texts.push(node);
  }

  const marks: HTMLElement[] = [];
  for (const node of texts) {
    const segments = splitHighlight(node.nodeValue ?? '', tokens);
    if (!segments.some((segment) => segment.hit)) continue;
    const fragment = doc.createDocumentFragment();
    for (const segment of segments) {
      if (!segment.hit) {
        fragment.append(doc.createTextNode(segment.text));
        continue;
      }
      const mark = doc.createElement('mark');
      mark.setAttribute(MARK_ATTR, '');
      mark.style.backgroundColor = '#fcd34d';
      mark.style.color = '#0f172a';
      mark.style.borderRadius = '2px';
      mark.textContent = segment.text;
      fragment.append(mark);
      marks.push(mark);
    }
    node.replaceWith(fragment);
  }
  return marks;
}

export function clearMarks(root: Element): void {
  for (const mark of [...root.querySelectorAll(`mark[${MARK_ATTR}]`)]) {
    const parent = mark.parentNode;
    mark.replaceWith(mark.textContent ?? '');
    // Re-join split text nodes so the next search can match across the old mark.
    parent?.normalize();
  }
}
