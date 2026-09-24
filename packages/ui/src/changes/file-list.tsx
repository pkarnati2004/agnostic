import type { ChangedFile } from "@agnostic/core";
import { FileRow } from "./file-row";

type FileListProps = {
  files: ChangedFile[];
  selected: string | null;
  onSelect: (path: string) => void;
};

/** The changed files, at most 40% of the column so the patch under them keeps the rest. */
export function FileList({ files, selected, onSelect }: FileListProps) {
  return (
    <div
      role="listbox"
      aria-label="Changed files"
      className="max-h-[40%] shrink-0 overflow-y-auto border-border border-b py-1"
    >
      {files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          selected={file.path === selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
