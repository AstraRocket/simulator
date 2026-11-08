import { useEffect, useState } from 'react';
import { type HelpEntry, type HelpPage, type HelpTarget, loadHelpPage } from '../../services/app/helpDocs';

export function useHelpPage(target: HelpTarget): {
  probed: { src: string; page: HelpPage | null } | null;
  pages: HelpEntry[];
} {
  const [probe, setProbe] = useState<{ src: string; page: HelpPage | null } | null>(null);
  const [pages, setPages] = useState<HelpEntry[]>([]);

  // Probe first: without `web/public/docs` Vite answers with the app's shell and a 200.
  useEffect(() => {
    let canceled = false;
    void loadHelpPage(target).then((page) => {
      if (canceled) return;
      setProbe({ src: target.src, page });
      if (page && page.contents.pages.length) setPages(page.contents.pages);
    });
    return () => {
      canceled = true;
    };
  }, [target]);

  return { probed: probe?.src === target.src ? probe : null, pages };
}
