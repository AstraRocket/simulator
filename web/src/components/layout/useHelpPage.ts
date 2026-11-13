import { useState } from 'react';
import { type HelpEntry, type HelpPage, type HelpTarget, loadHelpPage } from '../../services/app/helpDocs';
import { useAsyncLoad } from '../common/useAsyncLoad';

export function useHelpPage(target: HelpTarget): {
  probed: { src: string; page: HelpPage | null } | null;
  pages: HelpEntry[];
} {
  const [pages, setPages] = useState<HelpEntry[]>([]);

  // Probe first: without `web/public/docs` Vite answers with the app's shell and a 200.
  const probe = useAsyncLoad(() => loadHelpPage(target), target.src, {
    refresh: target,
    onLoaded: (page) => {
      if (page && page.contents.pages.length) setPages(page.contents.pages);
    },
  });

  return { probed: probe.data !== undefined ? { src: target.src, page: probe.data } : null, pages };
}
