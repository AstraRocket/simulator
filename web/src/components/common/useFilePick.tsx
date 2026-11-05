import { useRef, type ReactElement } from 'react';

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
  const input = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={!!onFiles}
      aria-label={label}
      className="hidden"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (onFiles) {
          if (files.length) onFiles(files);
        } else if (files[0]) onFile?.(files[0]);
      }}
    />
  );
  return { pick: () => ref.current?.click(), input };
}
