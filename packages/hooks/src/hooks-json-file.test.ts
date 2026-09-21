import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HooksError } from "./error.js";
import {
  type HookLayout,
  type ManagedEvent,
  type ManagedHooksOptions,
  readHooksJson,
  updateHooksJson,
  withManagedHooks,
  withoutManagedHooks,
} from "./hooks-json-file.js";

const MARKER = "'/home/u/.agnostic/hooks/post.sh'";
const COMMAND = `sh ${MARKER} claude-code`;
const EVENTS: ManagedEvent[] = [{ event: "Stop" }, { event: "PreToolUse", matcher: "Ask" }];

const opts = (layout: HookLayout = "claude"): ManagedHooksOptions => ({
  layout,
  timeout: 5,
  marker: MARKER,
});
const ours = () => COMMAND;

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
    const merged = withManagedHooks(user, EVENTS, ours, opts());
    expect(merged.permissions).toEqual(user.permissions);
    expect(merged.hooks?.Stop?.[0]?.hooks?.[0]?.command).toBe("say done");
    expect(merged.hooks?.Stop?.[1]?.hooks?.[0]?.command).toBe(COMMAND);
    expect(merged.hooks?.PreToolUse?.[0]?.matcher).toBe("Ask");
  });

  it("replaces its own entries rather than adding a second one", () => {
    const once = withManagedHooks({}, EVENTS, ours, opts());
    const twice = withManagedHooks(once, EVENTS, ours, opts());
    expect(twice).toEqual(once);
    expect(twice.hooks?.Stop).toHaveLength(1);
  });

  it("recognises its own entries by the script path, not the whole command", () => {
    const installed = withManagedHooks({}, EVENTS, ours, opts());
    const other = withManagedHooks(
      installed,
      [{ event: "Stop" }],
      () => COMMAND.replace("claude-code", "codex"),
      opts(),
    );
    expect(other.hooks?.Stop).toHaveLength(1);
    expect(other.hooks?.PreToolUse).toBeUndefined();
  });

  it("sweeps an entry of ours that carries a reply the command no longer ends with", () => {
    const stale = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: `${COMMAND}; printf '%s\\n' '{}'` }] }],
      },
    };
    const installed = withManagedHooks(stale, [{ event: "Stop" }], ours, opts());
    expect(installed.hooks?.Stop).toHaveLength(1);
    expect(installed.hooks?.Stop?.[0]?.hooks?.[0]?.command).toBe(COMMAND);
  });

  it("writes Gemini's timeout in the unit Gemini reads", () => {
    const merged = withManagedHooks({}, [{ event: "AfterAgent" }], ours, {
      ...opts(),
      timeout: 5_000,
    });
    expect(merged.hooks?.AfterAgent?.[0]?.hooks?.[0]?.timeout).toBe(5_000);
  });

  it("puts the command on the entry itself for Cursor, and pins the version once", () => {
    const merged = withManagedHooks({}, [{ event: "stop" }], ours, opts("cursor"));
    expect(merged.version).toBe(1);
    expect(merged.hooks?.stop).toEqual([{ command: COMMAND }]);
    expect(
      withManagedHooks({ version: 2 }, [{ event: "stop" }], ours, opts("cursor")).version,
    ).toBe(2);
  });

  it("names the command `bash` and the timeout `timeoutSec` for Copilot", () => {
    const merged = withManagedHooks({}, [{ event: "Stop" }], ours, opts("copilot"));
    expect(merged.hooks?.Stop).toEqual([{ type: "command", bash: COMMAND, timeoutSec: 5 }]);
    expect(withoutManagedHooks(merged, MARKER).hooks).toBeUndefined();
  });

  it("removes only its own entries, and the event when nothing is left", () => {
    const user = { hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } };
    const merged = withManagedHooks(user, EVENTS, ours, opts());
    const removed = withoutManagedHooks(merged, MARKER);
    expect(removed.hooks?.Stop).toEqual(user.hooks.Stop);
    expect(removed.hooks?.PreToolUse).toBeUndefined();
  });

  it("leaves no empty hooks key behind when everything in it was ours", () => {
    const installed = withManagedHooks({ permissions: {} }, EVENTS, ours, opts());
    const removed = withoutManagedHooks(installed, MARKER);
    expect(removed).toEqual({ permissions: {} });
    expect("hooks" in removed).toBe(false);
  });

  it("writes only when a reinstall would change something", async () => {
    const file = join(dir, "nested", "settings.json");
    expect(await updateHooksJson(file, (c) => withManagedHooks(c, EVENTS, ours, opts()))).toBe(
      true,
    );
    const written = await readFile(file, "utf8");
    expect(await updateHooksJson(file, (c) => withManagedHooks(c, EVENTS, ours, opts()))).toBe(
      false,
    );
    expect(await readFile(file, "utf8")).toBe(written);
  });

  it("never writes the token or a port into the config it produces", () => {
    const merged = withManagedHooks({}, EVENTS, ours, opts());
    expect(JSON.stringify(merged)).not.toMatch(/token|127\.0\.0\.1|:\d{4}/);
  });

  it("is a HooksError, so the daemon can map it", async () => {
    await writeFile(join(dir, "bad.json"), "[]", "utf8");
    await expect(readHooksJson(join(dir, "bad.json"))).rejects.toBeInstanceOf(HooksError);
  });

  it("does not rewrite a file whose keys are the same, only reordered", async () => {
    const file = join(dir, "settings.json");
    // The file on disk has "hooks" before "permissions"; the update below produces the reverse.
    await writeFile(file, '{"hooks":{"Stop":[]},"permissions":{"allow":[]}}', "utf8");
    const changed = await updateHooksJson(file, () => ({
      permissions: { allow: [] },
      hooks: { Stop: [] },
    }));
    expect(changed).toBe(false);
    // Not just unchanged in content: the bytes on disk were never touched.
    expect(await readFile(file, "utf8")).toBe('{"hooks":{"Stop":[]},"permissions":{"allow":[]}}');
  });

  it("still writes a real value change, key order aside, and the new value is what lands", async () => {
    const file = join(dir, "settings.json");
    await writeFile(file, '{"hooks":{},"permissions":{"allow":["a"]}}', "utf8");
    const changed = await updateHooksJson(file, () => ({
      permissions: { allow: ["a", "b"] },
      hooks: {},
    }));
    expect(changed).toBe(true);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      permissions: { allow: ["a", "b"] },
      hooks: {},
    });
  });

  it("does not treat a user entry as ours for merely looking like our command", () => {
    // Same script name, a different absolute path: it does not contain agn's marker substring.
    const user = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "sh '/other/place/post.sh' claude-code" }] }],
      },
    };
    expect(withoutManagedHooks(user, MARKER)).toEqual(user);
    const merged = withManagedHooks(user, [{ event: "Stop" }], ours, opts());
    expect(merged.hooks?.Stop).toHaveLength(2);
  });
});
