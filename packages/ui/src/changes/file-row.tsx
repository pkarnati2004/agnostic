import type { ChangedFile } from "@agnostic/core";
import { cn } from "../class-names";

const LETTER: Record<ChangedFile["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

/** The letter carries the status, so the row needs no word for it (design §2). */
const LETTER_TOKEN: Record<ChangedFile["status"], string> = {
  added: "--status-running",
  modified: "--warning",
  deleted: "--destructive",
  renamed: "--muted-foreground",
  untracked: "--muted-foreground",
};

type FileRowProps = {
  file: ChangedFile;
  selected: boolean;
  onSelect: (path: string) => void;
};

/**
 * One changed file: the status letter, the directory behind the file name, and what it gained and
 * lost. The whole path is the row's title, for the cases where the name alone is not enough.
 */
export function FileRow({ file, selected, onSelect }: FileRowProps) {
  const cut = file.path.lastIndexOf("/");
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={file.path}
      onClick={() => onSelect(file.path)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left type-meta",
        "hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <span
        className="w-[10px] shrink-0 type-mono"
        style={{ color: `var(${LETTER_TOKEN[file.status]})` }}
      >
        {LETTER[file.status]}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {cut >= 0 && <span className="text-muted-foreground">{file.path.slice(0, cut + 1)}</span>}
        <span className="text-sidebar-foreground">{file.path.slice(cut + 1)}</span>
      </span>
      <Counts file={file} />
    </button>
  );
}

/** The same three forms `agn changes` prints, so the page and the CLI read alike. */
function Counts({ file }: { file: ChangedFile }) {
  if (file.status === "untracked") {
    return <span className="shrink-0 text-muted-foreground">untracked</span>;
  }
  if (file.additions === null || file.deletions === null) {
    return <span className="shrink-0 text-muted-foreground">binary</span>;
  }
  return (
    <>
      <span className="shrink-0 type-mono" style={{ color: "var(--diff-add-fg)" }}>
        {`+${file.additions}`}
      </span>
      <span className="shrink-0 type-mono" style={{ color: "var(--diff-del-fg)" }}>
        {`−${file.deletions}`}
      </span>
    </>
  );
}
