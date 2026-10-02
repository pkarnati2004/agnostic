import type { ChangedFile } from "@agnostic/core";
import { fileGroups, showGroupHeadings } from "./file-groups";
import { FileRow } from "./file-row";

type FileListProps = {
  files: ChangedFile[];
  selected: string | null;
  onSelect: (path: string) => void;
};

/** The changed files, at most 40% of the column so the patch under them keeps the rest. */
export function FileList({ files, selected, onSelect }: FileListProps) {
  const groups = fileGroups(files);
  const headings = showGroupHeadings(groups);
  return (
    <div
      role="listbox"
      aria-label="Changed files"
      className="max-h-[40%] shrink-0 overflow-y-auto border-border border-b py-1"
    >
      {groups.map((group) => (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls, not listbox rows
        <div key={group.state} role="group" aria-label={group.label} data-state={group.state}>
          {headings && (
            <p className="px-4 pt-1 pb-0.5 text-muted-foreground text-xs">
              {`${group.label} ${group.files.length}`}
            </p>
          )}
          {group.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={file.path === selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
