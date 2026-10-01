import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParsedHook } from "../hook-event-parser.js";
import { piFamilyParser } from "./parse.js";

const PAYLOADS = fileURLToPath(
  new URL("../../../../tests/fixtures/hooks/payloads/", import.meta.url),
);

const PI_TRANSCRIPT = "/home/u/.pi/agent/sessions/2026-09-01T10-00-00_abc.jsonl";

async function parse(harness: "pi" | "omp", name: string): Promise<ParsedHook> {
  const payload = JSON.parse(
    await readFile(`${PAYLOADS}${harness}/${name}.json`, "utf8"),
  ) as unknown;
  return piFamilyParser(harness).parse(payload);
}

describe("the Pi hook parser", () => {
  it("reads the transcript path as the session, because that is what pi resumes from", async () => {
    expect(await parse("pi", "session-start")).toEqual({
      event: "session_start",
      status: null,
      sessionId: PI_TRANSCRIPT,
      cwd: "/work/repo",
      usage: null,
    });
  });

  it("maps each of pi's events to what the task is doing", async () => {
    expect((await parse("pi", "agent-start")).status).toBe("running");
    expect((await parse("pi", "message-end")).status).toBe("running");
    expect((await parse("pi", "tool-execution-start-bash")).status).toBe("running");
    expect((await parse("pi", "tool-call-ask")).status).toBe("waiting");
    expect((await parse("pi", "ui-prompt-start")).status).toBe("waiting");
    expect((await parse("pi", "ui-prompt-end-idle")).status).toBe("waiting");
    expect((await parse("pi", "ui-prompt-end-working")).status).toBe("running");
    expect((await parse("pi", "agent-end")).status).toBe("waiting");
  });

  it("reads a reload and a continued turn as the events they are, and leaves the rest to pi", async () => {
    // The extension suppresses both; a payload that arrives anyway still reads the same way.
    expect((await parse("pi", "session-start-reload")).status).toBeNull();
    expect((await parse("pi", "agent-end-will-continue")).status).toBe("waiting");
  });

  it("carries no session while pi has not written the transcript, or names it relatively", async () => {
    expect((await parse("pi", "session-start-unwritten")).sessionId).toBeNull();
    expect((await parse("pi", "agent-start-relative-file")).sessionId).toBeNull();
  });

  it("reads OMP's session id, which is what OMP resumes from", async () => {
    expect(await parse("omp", "agent-start")).toEqual({
      event: "agent_start",
      status: "running",
      sessionId: "omp-session",
      cwd: "/work/repo",
      usage: null,
    });
  });

  it("maps OMP's question tool and its approval pair", async () => {
    expect((await parse("omp", "tool-call-ask")).status).toBe("waiting");
    expect((await parse("omp", "tool-approval-requested")).status).toBe("waiting");
    expect((await parse("omp", "tool-approval-resolved")).status).toBe("running");
    expect((await parse("omp", "agent-end")).status).toBe("waiting");
  });

  it("reads a tool named for a question however it is spelled", async () => {
    const parsed = piFamilyParser("pi").parse({
      hook_event_name: "tool_execution_start",
      tool_name: "AskUserQuestion",
      session_file: PI_TRANSCRIPT,
    });
    expect(parsed.status).toBe("waiting");
  });

  it("refuses a payload with no event name", () => {
    expect(() => piFamilyParser("pi").parse({ session_id: "pi-abc" })).toThrowError(
      /no event name/,
    );
  });
});
