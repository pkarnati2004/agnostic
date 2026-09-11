import { CoreError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { RegistryError } from "./error.js";

describe("RegistryError", () => {
  it("is a CoreError with its own name, code and hint", () => {
    const error = new RegistryError('no harness named "kimi"', {
      code: "harness-unknown",
      hint: "Run agn doctor to see the harnesses agn knows about.",
    });
    expect(error.name).toBe("RegistryError");
    expect(error.code).toBe("harness-unknown");
    expect(error.hint).toBe("Run agn doctor to see the harnesses agn knows about.");
    expect(error).toBeInstanceOf(CoreError);
  });
});
