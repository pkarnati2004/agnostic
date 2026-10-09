import { describe, expect, it } from "vitest";
import { ConfigPatchRequestSchema } from "./config-api.js";

const parse = (body: unknown) => ConfigPatchRequestSchema.safeParse(body);

describe("ConfigPatchRequestSchema", () => {
  it("takes a partial body: one key is a whole request", () => {
    expect(parse({ appearance: { theme: "ink" } }).success).toBe(true);
    expect(parse({ terminal: { size: 14 } }).success).toBe(true);
    expect(parse({ catalogCheck: false }).success).toBe(true);
  });

  it("takes an empty body, which asks for nothing and is answered with the file", () => {
    expect(parse({}).success).toBe(true);
  });

  it("takes null for the keys a user can clear", () => {
    expect(parse({ editor: null }).success).toBe(true);
    expect(parse({ terminal: { font: null } }).success).toBe(true);
    expect(parse({ specWriter: null }).success).toBe(true);
    expect(parse({ budget: { dailyUsd: null } }).success).toBe(true);
  });

  it("refuses a key nothing reads, at the top level and inside a section", () => {
    expect(parse({ themes: "ink" }).success).toBe(false);
    expect(parse({ appearance: { colour: "ink" } }).success).toBe(false);
    expect(parse({ terminal: { family: "Menlo" } }).success).toBe(false);
  });

  it("refuses a theme with no stylesheet and a size no terminal would read", () => {
    expect(parse({ appearance: { theme: "x" } }).success).toBe(false);
    expect(parse({ appearance: { mode: "auto" } }).success).toBe(false);
    expect(parse({ terminal: { size: 7 } }).success).toBe(false);
    expect(parse({ terminal: { size: 12.5 } }).success).toBe(false);
    expect(parse({ terminal: { font: "" } }).success).toBe(false);
  });

  it("takes the two keys the Recommendations and Tasks sections write", () => {
    expect(parse({ catalogStaleDays: 3 }).success).toBe(true);
    expect(parse({ specFirst: true }).success).toBe(true);
  });

  it("refuses a stale window no notice could use", () => {
    expect(parse({ catalogStaleDays: 0 }).success).toBe(false);
    expect(parse({ catalogStaleDays: 400 }).success).toBe(false);
    expect(parse({ catalogStaleDays: 1.5 }).success).toBe(false);
  });

  it("takes the window's own boundaries, a day and a year, and refuses one day past either end", () => {
    expect(parse({ catalogStaleDays: 1 }).success).toBe(true);
    expect(parse({ catalogStaleDays: 365 }).success).toBe(true);
    expect(parse({ catalogStaleDays: 366 }).success).toBe(false);
  });

  it("refuses port and plans: the port is a hand edit and doctor owns the plans", () => {
    expect(parse({ port: 7431 }).success).toBe(false);
    expect(parse({ plans: { claude: "max20" } }).success).toBe(false);
  });
});
