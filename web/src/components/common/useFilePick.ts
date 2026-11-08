import { createElement, useRef, type ChangeEvent, type ReactElement } from 'react';

// The input is cleared after every pick so choosing the same file again still fires.
export function useFilePick({
  accept,
  onFile,
  onFiles,
  label,
}: {
  accept: string;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
  label?: string;
}): { pick: () => void; input: ReactElement } {
  const ref = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line react-hooks/refs -- createElement only attaches the ref; JSX would make this a .tsx Fast Refresh rejects.
  const input = createElement('input', {
    ref,
    type: 'file',
    accept,
    multiple: !!onFiles,
    'aria-label': label,
    className: 'hidden',
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = '';
      if (onFiles) {
        if (files.length) onFiles(files);
      } else if (files[0]) onFile?.(files[0]);
    },
  });
  return { pick: () => ref.current?.click(), input };
}
