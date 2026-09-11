import { describe, expect, it } from "vitest";
import { IdSchema, newId } from "./id.js";

describe("newId", () => {
  it("returns ten characters from the id alphabet", () => {
    for (let i = 0; i < 100; i += 1) {
      const id = newId();
      expect(id).toHaveLength(10);
      expect(IdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("never repeats across ten thousand draws", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i += 1) {
      ids.add(newId());
    }
    expect(ids.size).toBe(10_000);
  });
});

describe("IdSchema", () => {
  it("rejects the excluded letters, wrong lengths and wrong types", () => {
    expect(IdSchema.safeParse("abcdefghil").success).toBe(false);
    expect(IdSchema.safeParse("abcdefghio").success).toBe(false);
    expect(IdSchema.safeParse("abcdefghi0").success).toBe(false);
    expect(IdSchema.safeParse("abcdefghi").success).toBe(false);
    expect(IdSchema.safeParse("ABCDEFGHIJ").success).toBe(false);
    expect(IdSchema.safeParse(1234567890).success).toBe(false);
  });
});
