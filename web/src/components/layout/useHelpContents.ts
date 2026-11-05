import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

// The rail classes' `md:` breakpoint; below it the rail overlays the text.
const isWide = () => window.matchMedia('(min-width: 768px)').matches;

export function useHelpContents(
  navigate: (next: string) => void,
  activeHash: string,
): {
  contentsOpen: boolean;
  toggleContents: () => void;
  pick: (next: string) => void;
  activeRow: RefObject<HTMLButtonElement | null>;
} {
  const [contentsOpen, setContentsOpen] = useState(isWide);
  const activeRow = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [activeHash]);

  const toggleContents = useCallback(() => setContentsOpen((o) => !o), []);

  const pick = useCallback(
    (next: string) => {
      navigate(next);
      if (!isWide()) setContentsOpen(false);
    },
    [navigate],
  );

  return { contentsOpen, toggleContents, pick, activeRow };
}
