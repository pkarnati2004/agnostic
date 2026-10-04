import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { geminiParser } from "./parse.js";

/** Gemini keys its tmp directory by a hash of the project path, as the fixture tree does. */
const CHAT = fileURLToPath(
  new URL(
    "../../../../tests/fixtures/transcripts/gemini/tmp/8c1f/chats/session-9b1c.json",
    import.meta.url,
  ),
);

let temp = "";

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-gemini-"));
  await mkdir(join(temp, "chats"), { recursive: true });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function chatsFile(name: string, text: string): Promise<string> {
  const path = join(temp, "chats", name);
  await writeFile(path, text, "utf8");
  return path;
}

describe("the Gemini chats parser", () => {
  it("reads a chats file and leaves the checkpoints beside it alone", () => {
    expect(geminiParser.isTranscript(CHAT)).toBe(true);
    expect(geminiParser.isTranscript("/home/u/.gemini/tmp/8c1f/checkpoint-wip.json")).toBe(false);
    expect(geminiParser.isTranscript("/home/u/.gemini/tmp/8c1f/chats/checkpoint-a.json")).toBe(
      false,
    );
  });

  it("splits the cached part out of the input and counts thoughts as output", async () => {
    const { turns, skipped, limit } = await geminiParser.parse(CHAT);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({
      harness: "gemini",
      sessionId: "9b1c4a7e-2f10-4c88-9d31-7a0b5e2c1f44",
      // Gemini writes no working directory in the file, so a row is attributed by session id.
      cwd: null,
      ts: "2026-09-11T14:00:20.000Z",
      model: "gemini-3-pro",
      tokensInput: 200,
      tokensOutput: 340,
      tokensCacheRead: 1000,
      tokensCacheWrite: null,
      costUsd: null,
      ref: "gemini:9b1c4a7e-2f10-4c88-9d31-7a0b5e2c1f44:m2",
    });
    expect(turns[1]?.model).toBe("gemini-3-flash");
    // The user message is no turn; the message with a total and no buckets is skipped.
    expect(skipped).toBe(1);
    expect(limit).toBeNull();
  });

  it("names the session after the file when the document carries no id", async () => {
    const path = await chatsFile(
      "session-e1f2.json",
      JSON.stringify({
        messages: [
          {
            type: "gemini",
            timestamp: "2026-09-11T14:00:00.000Z",
            tokens: { input: 10, output: 4 },
          },
        ],
      }),
    );

    const { turns } = await geminiParser.parse(path);

    expect(turns[0]?.sessionId).toBe("session-e1f2");
    // No message id either: the index in the document keeps the ref stable across rescans.
    expect(turns[0]?.ref).toBe("gemini:session-e1f2:0");
  });

  it("reports a file that is not JSON rather than counting it as empty", async () => {
    const path = await chatsFile("session-half.json", '{"messages": [{"type": "gem');

    await expect(geminiParser.parse(path)).rejects.toThrow();
  });
});
