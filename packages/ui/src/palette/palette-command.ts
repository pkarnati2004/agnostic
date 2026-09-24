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
  run: () => void;
};
