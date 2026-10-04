import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParsedHook } from "../hook-event-parser.js";
import { opencodeFamilyParser } from "./parse.js";

const PAYLOADS = fileURLToPath(
  new URL("../../../../tests/fixtures/hooks/payloads/", import.meta.url),
);

async function parse(harness: "opencode" | "mimo-code", name: string): Promise<ParsedHook> {
  const payload = JSON.parse(
    await readFile(`${PAYLOADS}${harness}/${name}.json`, "utf8"),
  ) as unknown;
  return opencodeFamilyParser(harness).parse(payload);
}

describe("the OpenCode hook parser", () => {
  it("reads the session id the plugin reports, and no directory", async () => {
    expect(await parse("opencode", "session-start")).toEqual({
      event: "SessionStart",
      status: null,
      sessionId: "ses_root",
      cwd: null,
      usage: null,
    });
  });

  it("maps busy to running and everything that waits on the user to waiting", async () => {
    expect((await parse("opencode", "session-busy")).status).toBe("running");
    expect((await parse("opencode", "session-idle")).status).toBe("waiting");
    expect((await parse("opencode", "permission-asked")).status).toBe("waiting");
    expect((await parse("opencode", "question-asked")).status).toBe("waiting");
    expect((await parse("opencode", "permission-replied")).status).toBe("running");
  });

  it("reads Mimo Code's events the same way, under its own id", async () => {
    expect(await parse("mimo-code", "session-busy")).toMatchObject({
      status: "running",
      sessionId: "ses_mimo",
    });
    expect((await parse("mimo-code", "session-idle")).status).toBe("waiting");
  });

  it("ignores the directory a payload carries: the plugin sends none agn would trust", () => {
    const parsed = opencodeFamilyParser("opencode").parse({
      hook_event_name: "SessionBusy",
      sessionID: "ses_root",
      cwd: "/work/elsewhere",
    });
    expect(parsed.cwd).toBeNull();
  });

  it("refuses a payload with no event name", () => {
    expect(() => opencodeFamilyParser("opencode").parse({ sessionID: "ses_root" })).toThrowError(
      /no event name/,
    );
  });
});
