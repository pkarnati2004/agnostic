import type { ChangedFile } from "@agnostic/core";
import { cn } from "../class-names";
import { Badge } from "../components/badge";

const LETTER: Record<ChangedFile["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

type FileRowProps = {
  file: ChangedFile;
  selected: boolean;
  onSelect: (path: string) => void;
};

/**
 * One changed file. The path is truncated from the left, because the end of it is the file name,
 * and the whole path is the row's title for the cases where that is not enough.
 */
export function FileRow({ file, selected, onSelect }: FileRowProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={file.path}
      onClick={() => onSelect(file.path)}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-1 text-left text-xs hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <span dir="rtl" className="min-w-0 flex-1 truncate text-left font-mono">
        {file.path}
      </span>
      <Badge variant="outline" className="px-1 py-0 font-mono">
        {LETTER[file.status]}
      </Badge>
      <span className="shrink-0 text-muted-foreground tabular-nums">{fileCounts(file)}</span>
    </button>
  );
}

/** The same three forms `agn changes` prints, so the page and the CLI read alike. */
function fileCounts(file: ChangedFile): string {
  if (file.status === "untracked") {
    return "untracked";
  }
  if (file.additions === null || file.deletions === null) {
    return "binary";
  }
  return `+${file.additions} -${file.deletions}`;
}
