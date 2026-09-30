import type { PaletteCommand } from "./palette-command";

/**
 * Case-insensitive substring on the label, in the ruled order: no fuzzy ranking, so a row never
 * moves past one the user has already looked at. The two rows built from the query are what the
 * query is for, so they pass it and sit at the end, under whatever the same words also matched.
 */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return commands;
  }
  const matched = commands.filter(
    (command) => !command.fromQuery && command.label.toLowerCase().includes(needle),
  );
  return [...matched, ...commands.filter((command) => command.fromQuery)];
}

/** The next row the arrow keys land on; both ends wrap. An empty list has only row 0 to sit on. */
export function moveSelection(index: number, count: number, by: 1 | -1): number {
  if (count === 0) {
    return 0;
  }
  return (index + by + count) % count;
}
