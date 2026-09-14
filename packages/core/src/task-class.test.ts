import { describe, expect, it } from "vitest";
import { TaskClassSchema } from "./task-class.js";

const base = { intent: "debug", scope: "small", risk: ["auth"], needsBrowser: false };

describe("TaskClassSchema", () => {
  it("keeps the intent the rules found when one was overridden", () => {
    const parsed = TaskClassSchema.parse({ ...base, automaticIntent: "research" });
    expect(parsed.automaticIntent).toBe("research");
  });

  it("refuses a scope it does not know", () => {
    expect(() =>
      TaskClassSchema.parse({ ...base, scope: "huge", automaticIntent: null }),
    ).toThrow();
  });

  it("refuses a field it was not given", () => {
    expect(() =>
      TaskClassSchema.parse({ ...base, automaticIntent: null, confidence: 0.5 }),
    ).toThrow();
  });
});
