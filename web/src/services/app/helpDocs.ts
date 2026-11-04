import { DOC_LOCALES, docPageFileUrl, localDocsUrlFor } from './appInfo';

/** A dev server without docs answers unknown paths with the app's index.html and a 200. */
const DOCUSAURUS_MARKER = 'id="__docusaurus"';

export interface HelpTarget {
  page: string;
  slug: string;
  hash: string;
  fileUrl: string;
  src: string;
}

export function splitPage(page: string): { slug: string; hash: string } {
  const at = page.indexOf('#');
  return at < 0 ? { slug: page, hash: '' } : { slug: page.slice(0, at), hash: page.slice(at) };
}

export function helpTarget(page: string, language: string): HelpTarget {
  const { slug, hash } = splitPage(page);
  const fileUrl = docPageFileUrl(localDocsUrlFor(language), slug);
  return { page, slug, hash, fileUrl, src: `${fileUrl}${hash}` };
}

export async function fetchHelpDocument(fileUrl: string): Promise<Document | null> {
  let html: string;
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  if (!html.includes(DOCUSAURUS_MARKER)) return null;
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Skips Docusaurus's anchor link, which adds a stray glyph to textContent. */
export function headingLabel(h: Element): string {
  return [...h.childNodes]
    .filter((n) => !(n instanceof Element && n.classList.contains('hash-link')))
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();
}

export function pageTitle(doc: Document): string | undefined {
  return doc.querySelector('article h1')?.textContent?.trim();
}

export interface HelpPage {
  title: string;
  contents: HelpContents;
}

/** Reads the served HTML, not the live frame: below 997px hydration removes the sidebar and TOC. */
export async function loadHelpPage(target: HelpTarget): Promise<HelpPage | null> {
  const doc = await fetchHelpDocument(target.fileUrl);
  if (!doc) return null;
  return {
    title: pageTitle(doc) ?? '',
    contents: readContents(doc),
  };
}

/** Strips the locale so the dialog re-adds the current one; the directory form does not resolve offline. */
export function helpTargetFromUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;

  // English is served at the docs root, so this is the root for every locale.
  const root = localDocsUrlFor('en');
  if (!url.pathname.startsWith(root)) return null;

  let rest = url.pathname.slice(root.length);
  const locale = rest.split('/')[0] ?? '';
  if (DOC_LOCALES.has(locale)) rest = rest.slice(locale.length + 1);

  const slug = rest.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '');
  return `${slug}${url.hash}`;
}

export interface HelpEntry {
  /** Null for a category label that is not itself a page. */
  page: string | null;
  label: string;
  level: number;
}

export interface HelpHeading {
  hash: string;
  label: string;
  level: number;
}

export interface HelpContents {
  pages: HelpEntry[];
  headings: HelpHeading[];
}

/** Collapsed categories' children are not rendered, so sidebars.ts must keep `collapsed: false`. */
export function readContents(doc: Document): HelpContents {
  const pages: HelpEntry[] = [];
  for (const li of doc.querySelectorAll('.theme-doc-sidebar-menu li')) {
    const level = Number(/-level-(\d+)/.exec(li.className)?.[1] ?? 0);
    const anchor = li.querySelector('a[href]');
    const label = anchor?.textContent?.trim();
    if (!anchor || !label || !level) continue;
    // A category links to its first child; as a page it would appear twice.
    const isCategory = li.classList.contains('theme-doc-sidebar-item-category');
    // getAttribute, not .href: a DOMParser document has no base URL.
    const page = isCategory ? null : helpTargetFromUrl(anchor.getAttribute('href') ?? '');
    if (!isCategory && page === null) continue;
    pages.push({ page, label, level });
  }

  // The article's headings, not the TOC widget, which unmounts below 997px.
  const headings: HelpHeading[] = [];
  for (const h of doc.querySelectorAll('.theme-doc-markdown h2[id], .theme-doc-markdown h3[id]')) {
    const label = headingLabel(h);
    if (!label) continue;
    headings.push({ hash: `#${h.id}`, label, level: h.tagName === 'H2' ? 1 : 2 });
  }

  return { pages, headings };
}
