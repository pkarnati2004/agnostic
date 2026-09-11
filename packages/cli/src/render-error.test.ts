import { CoreError, DaemonApiError } from "@agnostic/core";
import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";
import { renderError } from "./render-error.js";

describe("renderError", () => {
  it("reports a commander failure as a usage error", () => {
    const rendered = renderError(
      new CommanderError(1, "commander.unknownCommand", "error: unknown command 'nope'"),
    );
    expect(rendered.exitCode).toBe(2);
    expect(rendered.lines).toEqual(["error: unknown command 'nope'"]);
    expect(rendered.body.error.code).toBe("usage");
  });

  it("prints a typed error with its hint indented under it", () => {
    const rendered = renderError(
      new CoreError("/nope does not exist", { code: "path-not-found", hint: "Pass a real path." }),
    );
    expect(rendered.exitCode).toBe(1);
    expect(rendered.lines).toEqual(["agn: /nope does not exist", "  hint: Pass a real path."]);
    expect(rendered.body).toEqual({
      error: { code: "path-not-found", message: "/nope does not exist", hint: "Pass a real path." },
    });
  });

  it("lists the candidates one per line when an id was ambiguous", () => {
    const rendered = renderError(
      new DaemonApiError('"abc" matches 2 tasks', {
        code: "ambiguous-id",
        hint: "candidates: abc123, abc789",
        status: 409,
      }),
    );
    expect(rendered.lines).toEqual([
      'agn: "abc" matches 2 tasks',
      "  abc123",
      "  abc789",
      "  pass more characters",
    ]);
    expect(rendered.exitCode).toBe(1);
  });

  it("lists every candidate on its own line, not just the first two", () => {
    const rendered = renderError(
      new DaemonApiError('"a" matches 3 tasks', {
        code: "ambiguous-id",
        hint: "candidates: abc111, abc222, abc333",
        status: 409,
      }),
    );
    expect(rendered.lines).toEqual([
      'agn: "a" matches 3 tasks',
      "  abc111",
      "  abc222",
      "  abc333",
      "  pass more characters",
    ]);
    expect(rendered.exitCode).toBe(1);
  });

  it("says an untyped failure was unexpected", () => {
    const rendered = renderError(new Error("socket hang up"));
    expect(rendered.exitCode).toBe(1);
    expect(rendered.lines).toEqual(["agn: unexpected error: socket hang up"]);
    expect(rendered.body.error.code).toBe("internal");
  });
});
