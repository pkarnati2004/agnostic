import type { LucideIcon } from "lucide-react";

/**
 * Which part of the list a row belongs to: the rows that start a task, the tab in front's own
 * commands, the rest, or the answer to a Recommend.
 */
export type PaletteGroup = "query" | "task" | "commands" | "answer";

/** One row of the command palette: what it reads as, and the click it stands for. */
export type PaletteCommand = {
  /** Stable and unique in a list, so a row keeps its identity as the list is filtered. */
  id: string;
  /** What the row shows, and what the substring filter matches: "Stop <title>", "Run: <query>". */
  label: string;
  /** A second, muted line: the repo the command acts on, or what the row opens. */
  hint: string | null;
  /** True for the two rows built from the query: they are never filtered by it. */
  fromQuery: boolean;
  group: PaletteGroup;
  /** Null for an "answer" row, which is drawn as a card with the profile's mark on it. */
  icon: LucideIcon | null;
  /** The profile an "answer" row would run; null for every other row. */
  profileId: string | null;
  run: () => void;
};
