import type { CompareTaskRow } from "@agnostic/core";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
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
  const kept = picked === "kept";
  const changes = changesCell(row.changes);
  return (
    <section
      data-picked={picked ?? undefined}
      className="flex min-w-[230px] flex-1 flex-col border-border border-r last:border-r-0"
      style={
        kept
          ? {
              backgroundColor: "color-mix(in srgb, var(--ring) 5%, transparent)",
              boxShadow: "inset 0 2px 0 var(--ring)",
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-2 border-border border-b p-3.5 pb-3">
        <ProfileChip profileId={row.profileId} billing={row.billing} variant="column" />
        {kept && (
          <span
            className="inline-flex items-center gap-1.5 font-medium type-meta"
            style={{ color: "var(--ring)" }}
          >
            <Check className="size-3" />
            Picked
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-[7px] border-border border-b p-3.5 type-meta">
        <Cell label="Status">
          <span className="inline-flex items-center gap-1.5">
            <StatusGlyph status={row.status} size="tab" />
            {STATUS_DOT[row.status].label}
          </span>
        </Cell>
        <Cell label="Files">
          <span className="type-mono-lg">{changes.files}</span>
        </Cell>
        <Cell label="Lines">{lines(changes)}</Cell>
        <Cell label="Tests">
          <span className="type-mono-lg">{testsCell(row.outcome, row.status)}</span>
        </Cell>
        <Cell label="Cost">{costCell(row.usage, row.billing)}</Cell>
        <Cell label="Time">
          <span className="type-mono-lg">{timeCell(row, row.outcome, now)}</span>
        </Cell>
      </dl>
      <div className="mt-auto flex gap-1.5 border-border border-t p-3.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={onOpen}>
          Open
        </Button>
        <Footer picked={picked} busy={busy} onPick={onPick} />
      </div>
    </section>
  );
}

/** The one control that changes the compare, or what a pick already did to this sibling. */
function Footer({
  picked,
  busy,
  onPick,
}: {
  picked: "kept" | "removed" | null;
  busy: boolean;
  onPick: () => void;
}) {
  if (picked === "removed") {
    return (
      <span className="flex-1 text-center text-muted-foreground type-meta">
        removed · branch kept
      </span>
    );
  }
  if (picked === "kept") {
    return (
      <Button
        size="sm"
        disabled
        className="flex-1 bg-[color-mix(in_srgb,var(--ring)_16%,transparent)] text-[color-mix(in_srgb,var(--ring)_70%,var(--foreground))]"
      >
        Picked
      </Button>
    );
  }
  return (
    <Button size="sm" className="flex-1" onClick={onPick} disabled={busy}>
      Pick
    </Button>
  );
}

function lines(changes: { added: string | null; removed: string | null }): ReactNode {
  if (changes.added === null || changes.removed === null) {
    return <span className="type-mono-lg">-</span>;
  }
  return (
    <span className="type-mono-lg">
      <span style={{ color: "var(--diff-add-fg)" }}>{changes.added}</span>{" "}
      <span style={{ color: "var(--diff-del-fg)" }}>{changes.removed}</span>
    </span>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </>
  );
}
