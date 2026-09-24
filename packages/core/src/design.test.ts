import { describe, expect, it } from "vitest";
import { designProfileId, designToolOf } from "./design.js";

describe("designProfileId", () => {
  it("records the tool where a profile id records a harness", () => {
    expect(designProfileId("figma")).toBe("other:figma:default:native");
    expect(designProfileId("claude-design")).toBe("other:claude-design:default:native");
  });
});

describe("designToolOf", () => {
  it("reads the tool back out of a design task's profile", () => {
    expect(designToolOf(designProfileId("figma"))).toBe("figma");
    expect(designToolOf(designProfileId("claude-design"))).toBe("claude-design");
  });

  it("answers null for a task an agent ran", () => {
    expect(designToolOf("claude-code:opus:native")).toBeNull();
    expect(designToolOf("other:mytool:default:native")).toBeNull();
  });

  it("answers null for a string that is not a profile id at all", () => {
    expect(designToolOf("figma")).toBeNull();
    expect(designToolOf("")).toBeNull();
    expect(designToolOf("other:figma:native")).toBeNull();
  });
});
