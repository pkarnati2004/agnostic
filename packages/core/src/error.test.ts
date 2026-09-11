import { describe, expect, it } from "vitest";
import { ConfigError, CoreError, ProcessError } from "./error.js";

describe("CoreError", () => {
  it("keeps code, hint and cause", () => {
    const cause = new Error("underlying");
    const error = new CoreError("could not parse the profile id", {
      code: "invalid-profile-id",
      hint: "Run agn profiles to see the ids that exist.",
      cause,
    });
    expect(error.name).toBe("CoreError");
    expect(error.code).toBe("invalid-profile-id");
    expect(error.hint).toBe("Run agn profiles to see the ids that exist.");
    expect(error.cause).toBe(cause);
    expect(error).toBeInstanceOf(Error);
  });

  it("leaves the hint undefined when none is given", () => {
    expect(new CoreError("boom", { code: "boom" }).hint).toBeUndefined();
  });
});

describe("ProcessError", () => {
  it("carries the command, args, exit code and stderr", () => {
    const error = new ProcessError("git status exited with code 128", {
      code: "process-failed",
      command: "git",
      args: ["status"],
      exitCode: 128,
      stderr: "not a git repository",
    });
    expect(error.name).toBe("ProcessError");
    expect(error.command).toBe("git");
    expect(error.args).toEqual(["status"]);
    expect(error.exitCode).toBe(128);
    expect(error.stderr).toBe("not a git repository");
    expect(error).toBeInstanceOf(CoreError);
  });
});

describe("ConfigError", () => {
  it("keeps the file it came from alongside the code and hint", () => {
    const error = new ConfigError("/repo/.ag/preferences.yaml is not valid: optimize", {
      code: "ag-file-invalid",
      hint: "Fix /repo/.ag/preferences.yaml or delete it to use the defaults.",
      file: "/repo/.ag/preferences.yaml",
    });
    expect(error.name).toBe("ConfigError");
    expect(error.file).toBe("/repo/.ag/preferences.yaml");
    expect(error.code).toBe("ag-file-invalid");
    expect(error.hint).toBe("Fix /repo/.ag/preferences.yaml or delete it to use the defaults.");
    expect(error).toBeInstanceOf(CoreError);
  });
});
