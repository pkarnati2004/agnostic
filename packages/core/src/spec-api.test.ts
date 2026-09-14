import { describe, expect, it } from "vitest";
import { SpecRequestSchema } from "./spec-api.js";

describe("SpecRequestSchema", () => {
  it("takes the one-liner and, optionally, the intent", () => {
    expect(SpecRequestSchema.parse({ prompt: "add a flag" })).toEqual({ prompt: "add a flag" });
    expect(SpecRequestSchema.parse({ prompt: "add a flag", intent: "implement" })).toMatchObject({
      intent: "implement",
    });
  });

  it("rejects an empty prompt, a missing prompt and a field it does not know", () => {
    expect(SpecRequestSchema.safeParse({ prompt: "" }).success).toBe(false);
    expect(SpecRequestSchema.safeParse({}).success).toBe(false);
    expect(SpecRequestSchema.safeParse({ prompt: "go", repoId: "r" }).success).toBe(false);
  });
});
