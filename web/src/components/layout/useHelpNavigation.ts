import { useCallback, useMemo, useState } from 'react';
import { type HelpTarget, helpTarget } from '../../services/app/helpDocs';

export function useHelpNavigation(
  page: string,
  language: string,
): { target: HelpTarget; canGoBack: boolean; open: (next: string) => void; goBack: () => void } {
  const [current, setCurrent] = useState(page);
  const [stack, setStack] = useState<string[]>([]);

  const target = useMemo(() => helpTarget(current, language), [current, language]);

  const open = useCallback(
    (next: string) => {
      setStack((s) => [...s, current]);
      setCurrent(next);
    },
    [current],
  );

  const goBack = useCallback(() => {
    const prev = stack[stack.length - 1];
    if (prev === undefined) return;
    setCurrent(prev);
    setStack(stack.slice(0, -1));
  }, [stack]);

  return { target, canGoBack: stack.length > 0, open, goBack };
}
