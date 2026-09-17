import { ProcessError, run } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { shimGit } from "./test-git-shim.js";

describe("shimGit", () => {
  it("puts the message on stderr verbatim, evaluating nothing in it", async () => {
    const message = "fatal: $(whoami) and `id` and $HOME stay literal";
    const restore = await shimGit(message);
    try {
      const error: unknown = await run("git", ["rev-parse", "HEAD"]).catch(
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(ProcessError);
      expect((error as ProcessError).stderr).toBe(message);
      expect((error as ProcessError).exitCode).toBe(128);
    } finally {
      restore();
    }
  });
});
