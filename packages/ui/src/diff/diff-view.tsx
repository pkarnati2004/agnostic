import { useMemo } from "react";
import {
  type DiffHunk,
  type DiffLine,
  type DiffLineKind,
  parseUnifiedDiff,
} from "./parse-unified-diff";

const ROW: Record<DiffLineKind, string> = {
  context: "text-muted-foreground",
  add: "bg-[var(--diff-add-bg)] text-[var(--diff-add-fg)]",
  del: "bg-[var(--diff-del-bg)] text-[var(--diff-del-fg)]",
  meta: "text-muted-foreground",
};

const MARKER: Record<DiffLineKind, string> = { context: " ", add: "+", del: "-", meta: " " };

const GUTTER = "w-10 select-none px-2 text-right align-top text-[var(--input)] tabular-nums";

/** One file's patch, unified, as git wrote it: no highlighting, no side-by-side, no word diff. */
export function DiffView({ patch, path }: { patch: string; path: string }) {
  const parsed = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const hunks = useMemo(() => hunkViews(parsed.hunks), [parsed]);
  if (parsed.binary) {
    return <Note>binary file, no diff</Note>;
  }
  if (hunks.length === 0) {
    return <Note>{`No changes in ${path}.`}</Note>;
  }
  return (
    <div className="overflow-x-auto">
      {hunks.map((hunk) => (
        <table key={hunk.key} className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            <tr className="text-muted-foreground">
              <td colSpan={3} className="bg-sidebar px-2 py-0.5 whitespace-pre">
                {hunk.header}
              </td>
            </tr>
            {hunk.rows.map((row) => (
              <Row key={row.key} line={row.line} />
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function Row({ line }: { line: DiffLine }) {
  return (
    <tr className={ROW[line.kind]}>
      <td className={GUTTER}>{line.oldNo}</td>
      <td className={GUTTER}>{line.newNo}</td>
      <td className="w-full whitespace-pre px-2">
        <span className="select-none">{MARKER[line.kind]}</span>
        {line.text}
      </td>
    </tr>
  );
}

function Note({ children }: { children: string }) {
  return <p className="px-4 py-3 text-muted-foreground text-sm">{children}</p>;
}

type HunkView = { key: string; header: string; rows: { key: string; line: DiffLine }[] };

/** Row identity for React: two `\ No newline` markers in one hunk are otherwise identical. */
function hunkViews(hunks: DiffHunk[]): HunkView[] {
  return hunks.map((hunk, position) => ({
    key: `h${position}:${hunk.header}`,
    header: hunk.header,
    rows: hunk.lines.map((line, row) => ({ key: `r${row}:${line.kind}`, line })),
  }));
}
