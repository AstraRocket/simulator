import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { HelpEntry } from '../../services/app/helpDocs';
import { type HelpHit, helpIndex, searchHelp, searchTokens } from '../../services/app/helpSearch';

const SEARCH_DEBOUNCE_MS = 200;

const SEARCH_MIN_CHARS = 2;

export function useHelpSearch(pages: HelpEntry[], language: string, pick: (next: string) => void) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; hits: HelpHit[] } | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const trimmed = query.trim();
  const resultsId = useId();

  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_CHARS || pages.length === 0) return;
    let canceled = false;
    const timer = window.setTimeout(() => {
      void helpIndex(pages, language).then((docs) => {
        if (!canceled) setFound({ query: trimmed, hits: searchHelp(docs, trimmed) });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, pages, language]);

  const openHit = useCallback(
    (hit: HelpHit) => {
      setHighlight(searchTokens(trimmed));
      pick(hit.page);
    },
    [pick, trimmed],
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setHighlight([]);
  }, []);

  const results = found?.query === trimmed ? found.hits : null;
  const searching = results === null && trimmed.length >= SEARCH_MIN_CHARS;
  const hitTokens = useMemo(() => searchTokens(trimmed), [trimmed]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && query !== '') {
      // Clear the search instead of letting useFocusTrap close the dialog.
      e.stopPropagation();
      clearSearch();
      return;
    }
    if (e.key !== 'Enter') return;
    const top = results?.[0];
    if (top) openHit(top);
  };

  return {
    query,
    setQuery,
    trimmed,
    resultsId,
    results,
    searching,
    hitTokens,
    highlight,
    openHit,
    clearSearch,
    onSearchKey,
  };
}
