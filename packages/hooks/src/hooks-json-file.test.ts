import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HooksError } from "./error.js";
import {
  type ManagedEvent,
  readHooksJson,
  updateHooksJson,
  withManagedHooks,
  withoutManagedHooks,
} from "./hooks-json-file.js";

const COMMAND = "sh '/home/u/.agnostic/hooks/post.sh' claude-code";
const EVENTS: ManagedEvent[] = [{ event: "Stop" }, { event: "PreToolUse", matcher: "Ask" }];

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agn-hooks-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the hook config file", () => {
  it("reads a missing file as an empty config", async () => {
    expect(await readHooksJson(join(dir, "nothing.json"))).toEqual({});
  });

  it("refuses an unparsable file and leaves its bytes alone", async () => {
    const file = join(dir, "settings.json");
    await writeFile(file, '{ "hooks": { "Stop": [] }, }', "utf8");
    await expect(readHooksJson(file)).rejects.toMatchObject({ code: "hook-config-unreadable" });
    expect(await readFile(file, "utf8")).toBe('{ "hooks": { "Stop": [] }, }');
  });

  it("keeps the user's own entries and their order", () => {
    const user = {
      permissions: { allow: ["Bash(git status:*)"] },
      hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] },
    };
    const merged = withManagedHooks(user, EVENTS, COMMAND);
    expect(merged.permissions).toEqual(user.permissions);
    expect(merged.hooks?.Stop?.[0]?.hooks[0]?.command).toBe("say done");
    expect(merged.hooks?.Stop?.[1]?.hooks[0]?.command).toBe(COMMAND);
    expect(merged.hooks?.PreToolUse?.[0]?.matcher).toBe("Ask");
  });

  it("replaces its own entries rather than adding a second one", () => {
    const once = withManagedHooks({}, EVENTS, COMMAND);
    const twice = withManagedHooks(once, EVENTS, COMMAND);
    expect(twice).toEqual(once);
    expect(twice.hooks?.Stop).toHaveLength(1);
  });

  it("recognises its own entries by the script path, not the whole command", () => {
    const installed = withManagedHooks({}, EVENTS, `${COMMAND}`);
    const other = withManagedHooks(
      installed,
      [{ event: "Stop" }],
      COMMAND.replace("claude-code", "codex"),
    );
    expect(other.hooks?.Stop).toHaveLength(1);
    expect(other.hooks?.PreToolUse).toBeUndefined();
  });

  it("removes only its own entries, and the event when nothing is left", () => {
    const user = { hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } };
    const merged = withManagedHooks(user, EVENTS, COMMAND);
    const removed = withoutManagedHooks(merged, COMMAND);
    expect(removed.hooks?.Stop).toEqual(user.hooks.Stop);
    expect(removed.hooks?.PreToolUse).toBeUndefined();
  });

  it("writes only when a reinstall would change something", async () => {
    const file = join(dir, "nested", "settings.json");
    expect(await updateHooksJson(file, (c) => withManagedHooks(c, EVENTS, COMMAND))).toBe(true);
    const written = await readFile(file, "utf8");
    expect(await updateHooksJson(file, (c) => withManagedHooks(c, EVENTS, COMMAND))).toBe(false);
    expect(await readFile(file, "utf8")).toBe(written);
  });

  it("never writes the token or a port into the config it produces", () => {
    const merged = withManagedHooks({}, EVENTS, COMMAND);
    expect(JSON.stringify(merged)).not.toMatch(/token|127\.0\.0\.1|:\d{4}/);
  });

  it("is a HooksError, so the daemon can map it", async () => {
    await writeFile(join(dir, "bad.json"), "[]", "utf8");
    await expect(readHooksJson(join(dir, "bad.json"))).rejects.toBeInstanceOf(HooksError);
  });
});
