import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "./log.js";
import { readRateLimitsFile } from "./rate-limits-file.js";

function stubLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), close: vi.fn() };
}

let home = "";

const paths = () => agnosticPaths(home);
const file = () => join(home, "rate-limits", "claude-code.json");

const PAYLOAD = JSON.stringify({
  rate_limits: { five_hour: { used_percentage: 58, resets_at: 1790258700 } },
});

async function writePayload(text: string, mtime: Date): Promise<void> {
  await mkdir(join(home, "rate-limits"), { recursive: true });
  await writeFile(file(), text, "utf8");
  await utimes(file(), mtime, mtime);
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-limits-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("readRateLimitsFile", () => {
  it("reports nothing when no status line has ever written one", async () => {
    expect(await readRateLimitsFile(paths(), "claude-code")).toBeNull();
  });

  it("takes the file's own mtime as the time the harness reported it", async () => {
    const mtime = new Date("2026-09-24T12:00:00.000Z");
    await writePayload(PAYLOAD, mtime);

    expect(await readRateLimitsFile(paths(), "claude-code")).toEqual({
      harness: "claude-code",
      fiveHour: { usedPercent: 58, resetsAt: "2026-09-24T14:05:00.000Z" },
      week: null,
      observedAt: mtime.toISOString(),
      source: "claude-statusline",
    });
  });

  it("reports nothing for a payload it cannot read", async () => {
    await writePayload("{ half a file", new Date());

    expect(await readRateLimitsFile(paths(), "claude-code")).toBeNull();
  });

  it("logs an unparsable file once, not on every request that follows", async () => {
    await writePayload("{ half a file", new Date());
    const log = stubLogger();

    await readRateLimitsFile(paths(), "claude-code", log);
    await readRateLimitsFile(paths(), "claude-code", log);

    expect(log.debug).toHaveBeenCalledTimes(1);
  });
});
