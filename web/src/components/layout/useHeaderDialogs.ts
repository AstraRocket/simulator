import { useState } from 'react';
import type { HeaderDialog } from './dialogKeys';

export type OpenFlags = Record<HeaderDialog, boolean>;

const NONE_OPEN: OpenFlags = {
  motors: false,
  report: false,
  about: false,
  updates: false,
  privacy: false,
  settings: false,
  library: false,
  examples: false,
  print: false,
  locations: false,
  parts: false,
  materials: false,
  backup: false,
  restore: false,
  saveAs: false,
};

export function useHeaderDialogs() {
  const [flags, setFlags] = useState<OpenFlags>(NONE_OPEN);
  const open = (id: HeaderDialog) => setFlags((f) => ({ ...f, [id]: true }));
  const close = (id: HeaderDialog) => setFlags((f) => ({ ...f, [id]: false }));
  return { flags, open, close };
}
