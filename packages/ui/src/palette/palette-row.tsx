import { useEffect, useRef } from "react";
import { cn } from "../class-names";
import { ProfileChip } from "../profile/profile-chip";
import type { PaletteCommand, PaletteGroup } from "./palette-command";

/** The label over each group of rows. */
const GROUP_LABELS: Record<PaletteGroup, string> = {
  query: "Run",
  task: "Current task",
  commands: "Commands",
  answer: "Recommend",
};

/** The row's DOM id, which the input names as its active descendant. */
export const optionId = (id: string): string => `palette-row-${id}`;

export type RowProps = {
  command: PaletteCommand;
  selected: boolean;
  onRun: () => void;
  onHover: () => void;
};

/**
 * The input keeps the focus and the keys, as a listbox does, so a row is never tabbed to. The press
 * rather than the release runs it: the mouse is a shortcut to what Enter would have done.
 */
export function Row({ command, selected, onRun, onHover }: RowProps) {
  const row = useRef<HTMLDivElement>(null);
  // The list scrolls past the fold, and the keys move the cursor, so the cursor brings the list.
  useEffect(() => {
    if (selected) {
      row.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);
  // A row with a profile behind it is the answer to a Recommend, which the design draws as a card.
  const profileId = command.profileId;
  return (
    <div
      ref={row}
      role="option"
      id={optionId(command.id)}
      // The card form draws a chip rather than the label, so the row carries its own name.
      aria-label={command.label}
      tabIndex={-1}
      aria-selected={selected}
      onMouseDown={(event) => {
        event.preventDefault();
        onRun();
      }}
      onMouseEnter={onHover}
      className={cn(
        "min-w-0 cursor-pointer rounded-[7px]",
        profileId === null
          ? "flex h-8 items-center gap-2.5 px-2.5 text-[13px]"
          : "flex flex-col gap-1.5 p-3",
        selected && "bg-accent text-accent-foreground",
      )}
    >
      {profileId === null ? (
        <Line command={command} />
      ) : (
        <Card profileId={profileId} reason={command.hint} />
      )}
    </div>
  );
}

/** A command by name: the icon of the button it stands for, the label, and where it acts. */
function Line({ command }: { command: PaletteCommand }) {
  const Icon = command.icon;
  return (
    <>
      {Icon !== null && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {command.hint !== null && (
        <span className="max-w-[40%] shrink-0 truncate text-muted-foreground type-meta">
          {command.hint}
        </span>
      )}
    </>
  );
}

/** agn's answer to a Recommend: who it picked, why, and what Enter does with it. */
function Card({ profileId, reason }: { profileId: string; reason: string | null }) {
  return (
    <>
      <ProfileChip profileId={profileId} variant="option" />
      {reason !== null && <span className="text-muted-foreground type-meta">{reason}</span>}
      <span className="text-muted-foreground type-mono">↵ Start a task with this profile</span>
    </>
  );
}

type LabelledRow = { command: PaletteCommand; index: number; label: string | null };

/**
 * Each row with the group label that goes above it, when it is the first row of its group. A label
 * is drawn once: the ruled row order keeps each group's rows next to each other, so one list does
 * not carry the same heading twice.
 */
export function labelled(rows: PaletteCommand[]): LabelledRow[] {
  const drawn = new Set<PaletteGroup>();
  return rows.map((command, index) => {
    const first = !drawn.has(command.group);
    drawn.add(command.group);
    return { command, index, label: first ? GROUP_LABELS[command.group] : null };
  });
}
