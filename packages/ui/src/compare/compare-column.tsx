import type { CompareTaskRow } from "@agnostic/core";
import { Button } from "../components/button";
import { ProfileChip } from "../profile/profile-chip";
import { STATUS_DOT } from "../status/status-dot";
import { StatusGlyph } from "../status/status-glyph";
import { changesCell, costCell, testsCell, timeCell } from "./compare-lines";

type CompareColumnProps = {
  row: CompareTaskRow;
  /** What a pick left this sibling as: the one kept, one whose worktree was removed, or neither. */
  picked: "kept" | "removed" | null;
  busy: boolean;
  now: number;
  onOpen: () => void;
  onPick: () => void;
};

/** One agent of a compare: what it is, what it did, and the two things you can do about it. */
export function CompareColumn({ row, picked, busy, now, onOpen, onPick }: CompareColumnProps) {
  const dot = STATUS_DOT[row.status];
  const changes = changesCell(row.changes);
  return (
    <section className="flex min-w-[220px] flex-col gap-3 rounded-md border border-border p-3">
      <ProfileChip profileId={row.profileId} billing={row.billing} variant="column" />
      <div className="flex items-center gap-2 text-sm">
        <StatusGlyph status={row.status} />
        {dot.label}
      </div>
      <dl className="flex flex-col gap-1 text-sm">
        <Cell label="files" value={changes.files} />
        <Cell label="+/-" value={changes.lines} />
        <Cell label="tests" value={testsCell(row.outcome)} />
        <Cell label="cost" value={costCell(row.usage, row.billing)} />
        <Cell label="time" value={timeCell(row, row.outcome, now)} />
      </dl>
      <div className="mt-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onOpen}>
          Open
        </Button>
        {picked === "removed" ? (
          <span className="text-muted-foreground text-xs">removed · branch kept</span>
        ) : (
          <Button size="sm" onClick={onPick} disabled={busy || picked === "kept"}>
            Pick
          </Button>
        )}
      </div>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs leading-5">{value}</dd>
    </div>
  );
}
