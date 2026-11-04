import { createRequestStore } from './requestStore';

export interface PromptOptions {
  title: string;
  confirmLabel: string;
  initialName: string;
  /** Warns about a duplicate, does not forbid it. */
  takenNames?: string[];
}

export const usePromptStore = createRequestStore<PromptOptions, string | null>(null);

export function prompt(opts: PromptOptions): Promise<string | null> {
  return usePromptStore.getState().open(opts);
}
