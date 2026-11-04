import { Fragment, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { HelpEntry, HelpHeading } from '../../services/app/helpDocs';
import { splitHighlight } from '../../services/app/helpSearch';
import type { useHelpSearch } from './useHelpSearch';

const railRow =
  'block w-full truncate rounded px-2 py-1 text-left text-xs text-ink-soft hover:bg-raised hover:text-ink-strong';

function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {splitHighlight(text, tokens).map((segment, i) =>
        segment.hit ? (
          <mark key={i} className="rounded bg-warn-300/25 text-warn-100">
            {segment.text}
          </mark>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

export function HelpRail({
  search,
  pages,
  headings,
  slug,
  activeHash,
  activeRow,
  pick,
}: {
  search: ReturnType<typeof useHelpSearch>;
  pages: HelpEntry[];
  headings: HelpHeading[];
  slug: string;
  activeHash: string;
  activeRow: RefObject<HTMLButtonElement | null>;
  pick: (next: string) => void;
}) {
  const { t } = useTranslation();
  const { query, setQuery, trimmed, resultsId, results, searching, hitTokens, openHit, clearSearch, onSearchKey } =
    search;

  const pageRows = pages.map((entry, i) =>
    entry.page === null ? (
      <p
        key={`group-${i}`}
        className="mt-3 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint first:mt-0"
      >
        {entry.label}
      </p>
    ) : (
      <Fragment key={entry.page}>
        <button
          onClick={() => pick(entry.page!)}
          aria-current={entry.page === slug ? 'page' : undefined}
          className={`${railRow} ${entry.page === slug ? 'bg-raised font-semibold text-accent-300' : ''}`}
        >
          {entry.label}
        </button>
        {entry.page === slug &&
          headings.map((h) => (
            <button
              key={h.hash}
              ref={h.hash === activeHash ? activeRow : undefined}
              onClick={() => pick(`${slug}${h.hash}`)}
              aria-current={h.hash === activeHash ? 'location' : undefined}
              className={`${railRow} ${h.level > 1 ? 'pl-8' : 'pl-5'} ${
                h.hash === activeHash ? 'bg-raised text-accent-300' : 'text-ink-muted'
              }`}
            >
              {h.label}
            </button>
          ))}
      </Fragment>
    ),
  );

  return (
    <nav
      aria-label={t('help.contents')}
      className="absolute inset-y-0 left-0 z-10 w-56 shrink-0 overflow-y-auto border-r border-line/10 bg-surface p-2 md:static md:z-auto"
    >
      <div className="mb-2 flex items-center gap-1">
        <input
          // Not type="search": some browsers add a second clear glyph.
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder={t('help.search')}
          aria-label={t('help.search')}
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded bg-raised px-2 py-1 text-xs text-ink ring-1 ring-line/10 placeholder:text-ink-faint focus:outline-none focus:ring-accent-500"
        />
        {query !== '' && (
          <button
            onClick={clearSearch}
            aria-label={t('help.searchClear')}
            title={t('help.searchClear')}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-ink-muted hover:bg-raised hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      {results !== null ? (
        results.length === 0 ? (
          <p className="px-2 py-3 text-xs text-ink-muted">{t('help.searchNone', { query: trimmed })}</p>
        ) : (
          <div role="group" aria-labelledby={resultsId}>
            <p id={resultsId} className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              {t('help.searchMatches', { n: results.length })}
            </p>
            {results.map((hit) => (
              <button
                key={hit.page}
                onClick={() => openHit(hit)}
                className="mb-1 block w-full rounded px-2 py-1 text-left hover:bg-raised"
              >
                <span className="block truncate text-xs font-semibold text-ink">
                  <Marked text={hit.heading || hit.label} tokens={hitTokens} />
                </span>
                {hit.heading !== '' && <span className="block truncate text-[10px] text-ink-faint">{hit.label}</span>}
                <span className="mt-0.5 block text-[10px] leading-snug text-ink-muted">
                  <Marked text={hit.snippet} tokens={hitTokens} />
                </span>
              </button>
            ))}
          </div>
        )
      ) : searching ? (
        <p className="px-2 py-3 text-xs text-ink-faint">{t('help.searchBusy')}</p>
      ) : (
        pageRows
      )}
    </nav>
  );
}
