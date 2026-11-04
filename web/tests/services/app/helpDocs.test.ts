// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { helpTarget, helpTargetFromUrl, loadHelpPage, readContents } from '../../../src/services/app/helpDocs';

const appBase = import.meta.env.BASE_URL.replace(/\/*$/, '/');
const origin = window.location.origin;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('helpTarget', () => {
  it('resolves a slug to the precached file, not the directory', () => {
    // The directory form misses the precache (directoryIndex is off in vite.config.ts).
    expect(helpTarget('safety', 'en').fileUrl).toBe(`${appBase}docs/safety/index.html`);
  });

  it('treats the empty page as the docs index', () => {
    const target = helpTarget('', 'en');
    expect(target.slug).toBe('');
    expect(target.fileUrl).toBe(`${appBase}docs/index.html`);
  });

  it('splits an anchor off the slug', () => {
    const target = helpTarget('designing-a-rocket#fins', 'en');
    expect(target.slug).toBe('designing-a-rocket');
    expect(target.hash).toBe('#fins');
    expect(target.fileUrl).toBe(`${appBase}docs/designing-a-rocket/index.html`);
    expect(target.src).toBe(`${appBase}docs/designing-a-rocket/index.html#fins`);
  });

  it('reads a translated page out of the locale tree', () => {
    expect(helpTarget('safety', 'es').fileUrl).toBe(`${appBase}docs/es/safety/index.html`);
  });
});

describe('helpTargetFromUrl', () => {
  it('turns an in-frame docs link back into a page', () => {
    expect(helpTargetFromUrl(`${origin}${appBase}docs/faq/`)).toBe('faq');
  });

  it('accepts the file form as well as the directory form', () => {
    expect(helpTargetFromUrl(`${origin}${appBase}docs/faq/index.html`)).toBe('faq');
  });

  it('keeps the anchor', () => {
    expect(helpTargetFromUrl(`${origin}${appBase}docs/faq/#answers`)).toBe('faq#answers');
  });

  it('maps the docs root to the index page', () => {
    expect(helpTargetFromUrl(`${origin}${appBase}docs/`)).toBe('');
  });

  it('strips the locale segment so the dialog can re-add the current one', () => {
    expect(helpTargetFromUrl(`${origin}${appBase}docs/es/faq/`)).toBe('faq');
    expect(helpTargetFromUrl(`${origin}${appBase}docs/faq/`)).toBe('faq');
    expect(helpTargetFromUrl(`${origin}${appBase}docs/es/`)).toBe('');
  });

  it('reports a link that leaves the docs, so the dialog can open a tab', () => {
    expect(helpTargetFromUrl('https://github.com/AstraRocket/simulator')).toBeNull();
    expect(helpTargetFromUrl('https://openrocket.readthedocs.io/')).toBeNull();
  });

  it('reports a same-origin link that is not a docs page', () => {
    expect(helpTargetFromUrl(`${origin}${appBase}`)).toBeNull();
    expect(helpTargetFromUrl(`${origin}${appBase}docs-archive/faq/`)).toBeNull();
  });

  it('reports an unparseable href rather than throwing', () => {
    expect(helpTargetFromUrl('http://[')).toBeNull();
  });
});

describe('loadHelpPage', () => {
  const target = helpTarget('safety', 'en');
  const served = (body: string) => `<!doctype html><html><body><div id="__docusaurus">${body}</div></body></html>`;
  const answers = (html: string) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }));

  it('reads the heading and the contents out of the served page', async () => {
    answers(served(`<article><h1>Safety</h1></article>${SIDEBAR}`));
    const page = await loadHelpPage(target);
    expect(page?.title).toBe('Safety');
    expect(page?.contents.pages.map((p) => p.label)).toContain('FAQ');
  });

  it('rejects the app shell answering for a missing page', async () => {
    // Dev build: web/public/docs is gitignored and Vite answers with index.html and a 200.
    answers('<div id="root"></div>');
    await expect(loadHelpPage(target)).resolves.toBeNull();
  });

  it('rejects a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('') }));
    await expect(loadHelpPage(target)).resolves.toBeNull();
  });

  it('rejects a failed fetch rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(loadHelpPage(target)).resolves.toBeNull();
  });

  it('asks for the file URL, which is the precache key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(served('')) });
    vi.stubGlobal('fetch', fetchMock);
    await loadHelpPage(helpTarget('safety#storage', 'en'));
    expect(fetchMock).toHaveBeenCalledWith(`${appBase}docs/safety/index.html`);
  });

  it('resolves sidebar links although a parsed document has no base URL', async () => {
    // DOMParser leaves `a.href` empty, so the reader takes the href attribute.
    answers(served(SIDEBAR));
    const page = await loadHelpPage(target);
    expect(page?.contents.pages.filter((p) => p.page !== null)).not.toEqual([]);
  });
});

// Docusaurus output: the class names are the contract, so keep them verbatim.
const SIDEBAR = `
<nav aria-label="Docs sidebar" class="menu">
  <ul class="theme-doc-sidebar-menu menu__list">
    <li class="theme-doc-sidebar-item-category theme-doc-sidebar-item-category-level-1 menu__list-item">
      <div class="menu__list-item-collapsible"><a class="menu__link" href="/docs/"><span>Introduction</span></a></div>
      <ul class="menu__list">
        <li class="theme-doc-sidebar-item-link theme-doc-sidebar-item-link-level-2 menu__list-item">
          <a class="menu__link" href="/docs/"><span>Overview</span></a></li>
        <li class="theme-doc-sidebar-item-link theme-doc-sidebar-item-link-level-2 menu__list-item">
          <a class="menu__link" href="/docs/faq/"><span>FAQ</span></a></li>
      </ul>
    </li>
    <li class="theme-doc-sidebar-item-category theme-doc-sidebar-item-category-level-1 menu__list-item">
      <div class="menu__list-item-collapsible"><a class="menu__link" href="/docs/safety/"><span>User Guide</span></a></div>
      <ul class="menu__list">
        <li class="theme-doc-sidebar-item-link theme-doc-sidebar-item-link-level-2 menu__list-item">
          <a class="menu__link" href="/docs/safety/"><span>Safety</span></a></li>
      </ul>
    </li>
  </ul>
</nav>`;

const ARTICLE = `
<article>
  <div class="theme-doc-markdown markdown">
    <h1>Designing a Rocket</h1>
    <h2 class="anchor" id="the-component-tree">The component tree<a href="#the-component-tree" class="hash-link" title="Direct link to The component tree"></a></h2>
    <h3 class="anchor" id="dual-deployment">Dual deployment<a href="#dual-deployment" class="hash-link"></a></h3>
    <h2 class="anchor" id="undo--redo">Undo / redo<a href="#undo--redo" class="hash-link"></a></h2>
  </div>
</article>`;

describe('readContents', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const read = (html: string) => {
    document.body.innerHTML = html;
    return readContents(document);
  };

  it('reads the whole page list out of one page', () => {
    expect(read(SIDEBAR).pages).toEqual([
      { page: null, label: 'Introduction', level: 1 },
      { page: '', label: 'Overview', level: 2 },
      { page: 'faq', label: 'FAQ', level: 2 },
      { page: null, label: 'User Guide', level: 1 },
      { page: 'safety', label: 'Safety', level: 2 },
    ]);
  });

  it('makes a category a label, not a page', () => {
    const [intro] = read(SIDEBAR).pages;
    expect(intro?.page).toBeNull();
  });

  it('reads the current page headings, with their nesting', () => {
    expect(read(ARTICLE).headings).toEqual([
      { hash: '#the-component-tree', label: 'The component tree', level: 1 },
      { hash: '#dual-deployment', label: 'Dual deployment', level: 2 },
      { hash: '#undo--redo', label: 'Undo / redo', level: 1 },
    ]);
  });

  it('reports empty lists for a page with neither', () => {
    expect(read('<p>nothing here</p>')).toEqual({ pages: [], headings: [] });
  });
});
