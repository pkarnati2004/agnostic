import { describe, expect, it } from "vitest";
import { renderFields } from "./fields.js";

describe("renderFields", () => {
  it("aligns every value under the widest key", () => {
    expect(
      renderFields([
        ["id", "t3n9v2wxyz"],
        ["title", "add a --verbose flag"],
        ["status", "running"],
      ]),
    ).toEqual(["id:     t3n9v2wxyz", "title:  add a --verbose flag", "status: running"]);
  });

  it("returns nothing for no fields", () => {
    expect(renderFields([])).toEqual([]);
  });

  it("needs no padding when every key is the same length", () => {
    expect(
      renderFields([
        ["one", "a"],
        ["two", "b"],
      ]),
    ).toEqual(["one: a", "two: b"]);
  });

  it("measures a multibyte key in code points, so the colon still lines up", () => {
    const lines = renderFields([
      ["café", "1"],
      ["abcd", "2"],
    ]);
    expect(lines[0]?.indexOf("1")).toBe(lines[1]?.indexOf("2"));
  });
});
