export type Column<T> = {
  header: string;
  value: (row: T) => string;
  align?: "left" | "right";
};

const GUTTER = "  ";

/** Header plus one line per row, padded to the widest cell; no rows means nothing to print. */
export function renderTable<T>(rows: T[], columns: Column<T>[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, index) =>
    Math.max(width(column.header), ...cells.map((cell) => width(cell[index] ?? ""))),
  );
  const header = columns.map((column, index) => pad(column.header, widths[index] ?? 0, "left"));
  const body = cells.map((cell) =>
    columns.map((column, index) =>
      pad(cell[index] ?? "", widths[index] ?? 0, column.align ?? "left"),
    ),
  );
  return [header, ...body].map(join);
}

/** The header on its own, for a list that is empty but whose shape is still worth showing. */
export function tableHeader<T>(columns: Column<T>[]): string {
  return join(columns.map((column) => column.header));
}

function join(cells: string[]): string {
  return cells.join(GUTTER).trimEnd();
}

// Padding counts code points: an emoji or an accented letter is one cell wide here, not two bytes.
function width(cell: string): number {
  return [...cell].length;
}

function pad(cell: string, to: number, align: "left" | "right"): string {
  const fill = " ".repeat(Math.max(0, to - width(cell)));
  return align === "right" ? `${fill}${cell}` : `${cell}${fill}`;
}
