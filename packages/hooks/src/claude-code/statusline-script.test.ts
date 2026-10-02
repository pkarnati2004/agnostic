import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeStatusLineScript } from "./statusline-script.js";

let home = "";

const paths = () => agnosticPaths(home);
const script = () => join(home, "hooks", "statusline.sh");
const limits = () => join(home, "rate-limits", "claude-code.json");
const stamp = () => join(home, "rate-limits", "claude-code.stamp");

const PAYLOAD = JSON.stringify({
  session_id: "s-1",
  rate_limits: { five_hour: { used_percentage: 58, resets_at: 1790258700 } },
});

/** The script as Claude Code runs it: the payload on stdin, the user's own command as `$1`. */
async function tick(payload: string, userCommand?: string) {
  return run("sh", userCommand === undefined ? [script()] : [script(), userCommand], {
    input: payload,
  });
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-statusline-"));
  await writeStatusLineScript(paths());
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("the status-line script", () => {
  it("writes the payload byte for byte, and a stamp beside it", async () => {
    const result = await tick(PAYLOAD);

    expect(result.exitCode).toBe(0);
    expect(await readFile(limits(), "utf8")).toBe(PAYLOAD);
    expect(Number((await readFile(stamp(), "utf8")).trim())).toBeGreaterThan(0);
  });

  it("writes nothing on a second tick inside the throttle window", async () => {
    await tick(PAYLOAD);
    const first = (await stat(limits())).mtimeMs;

    await tick(PAYLOAD.replace("58", "59"));

    expect(await readFile(limits(), "utf8")).toBe(PAYLOAD);
    expect((await stat(limits())).mtimeMs).toBe(first);
  });

  it("writes again once the stamp is older than the window", async () => {
    await tick(PAYLOAD);
    const long_ago = Math.floor(Date.now() / 1_000) - 60;
    await writeFile(stamp(), `${long_ago}\n`, "utf8");

    const next = PAYLOAD.replace("58", "59");
    await tick(next);

    expect(await readFile(limits(), "utf8")).toBe(next);
  });

  it("writes nothing for a payload without rate limits", async () => {
    const result = await tick(JSON.stringify({ session_id: "s-1" }));

    expect(result.exitCode).toBe(0);
    await expect(readFile(limits(), "utf8")).rejects.toThrow();
  });

  it("still runs the user's own command on a payload without rate limits", async () => {
    const noLimits = JSON.stringify({ session_id: "s-1" });

    const result = await tick(noLimits, "cat");

    expect(result.stdout).toBe(noLimits);
    await expect(readFile(limits(), "utf8")).rejects.toThrow();
  });

  it("leaves no temporary file behind", async () => {
    await tick(PAYLOAD);

    expect((await readdir(join(home, "rate-limits"))).sort()).toEqual([
      "claude-code.json",
      "claude-code.stamp",
    ]);
  });

  it("pipes the same payload into the user's own command and prints what it prints", async () => {
    const result = await tick(PAYLOAD, "cat");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(PAYLOAD);
  });

  it("prints nothing when the user has no command of their own", async () => {
    expect((await tick(PAYLOAD)).stdout).toBe("");
  });

  it("prints nothing but still writes the file when the second argument is empty", async () => {
    const result = await tick(PAYLOAD, "");

    expect(result.stdout).toBe("");
    expect(await readFile(limits(), "utf8")).toBe(PAYLOAD);
  });

  it("exits without a word on empty input", async () => {
    const result = await tick("", "cat");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("rewrites itself only when the text has changed", async () => {
    const before = (await stat(script())).mtimeMs;

    await writeStatusLineScript(paths());

    expect((await stat(script())).mtimeMs).toBe(before);
  });
});

describe("the status-line script under a HOME path with a space", () => {
  let spacedHome = "";

  beforeEach(async () => {
    spacedHome = await mkdtemp(join(tmpdir(), "agn statusline "));
    await writeStatusLineScript(agnosticPaths(spacedHome));
  });

  afterEach(async () => {
    await rm(spacedHome, { recursive: true, force: true });
  });

  it("quotes the script's own paths so a space in HOME does not split them", async () => {
    const result = await run("sh", [join(spacedHome, "hooks", "statusline.sh")], {
      input: PAYLOAD,
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(spacedHome, "rate-limits", "claude-code.json"), "utf8")).toBe(
      PAYLOAD,
    );
  });
});
