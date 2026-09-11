import { describe, expect, it } from "vitest";
import { type Column, renderTable, tableHeader } from "./table.js";

type Row = { id: string; count: number };

const COLUMNS: Column<Row>[] = [
  { header: "id", value: (row) => row.id },
  { header: "count", value: (row) => String(row.count), align: "right" },
];

describe("renderTable", () => {
  it("pads every cell to the widest one in its column", () => {
    const rows: Row[] = [
      { id: "short", count: 1 },
      { id: "much-longer-id", count: 20 },
      { id: "mid", count: 300 },
    ];
    expect(renderTable(rows, COLUMNS)).toEqual([
      "id              count",
      "short               1",
      "much-longer-id     20",
      "mid               300",
    ]);
  });

  it("returns nothing for no rows", () => {
    expect(renderTable([], COLUMNS)).toEqual([]);
  });

  it("measures a multibyte cell in code points, so the next column still lines up", () => {
    const rows: Row[] = [
      { id: "café", count: 1 },
      { id: "abcd", count: 2 },
    ];
    const lines = renderTable(rows, COLUMNS);
    expect(lines[1]?.indexOf("1")).toBe(lines[2]?.indexOf("2"));
  });
});

describe("tableHeader", () => {
  it("is the header line of the table the same columns would produce", () => {
    expect(tableHeader(COLUMNS)).toBe("id  count");
  });
});
