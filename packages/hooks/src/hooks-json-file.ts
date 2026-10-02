import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeConfigFile } from "./config-file.js";
import { configUnreadable } from "./error.js";

/**
 * The three shapes a JSON hook config takes. `claude` is the one Claude Code defined and Codex,
 * Gemini, Droid, Devin, OpenClaude and Command Code adopted: events holding groups of command
 * entries. `cursor` and `copilot` put one entry per event directly in the event's array.
 */
export type HookLayout = "claude" | "cursor" | "copilot";

/** Every field any of the three layouts puts on an entry; unknown keys survive a read and a write. */
const HookEntrySchema = z.looseObject({
  type: z.string().optional(),
  command: z.string().optional(),
  /** Copilot's name for the command it runs. */
  bash: z.string().optional(),
  timeout: z.number().optional(),
  timeoutSec: z.number().optional(),
});
const HookGroupSchema = HookEntrySchema.extend({
  matcher: z.string().optional(),
  hooks: z.array(HookEntrySchema).optional(),
});
/** Claude Code's one status-line slot, which agn fills only when it is empty or already agn's. */
const StatusLineSchema = z.looseObject({
  type: z.string().optional(),
  command: z.string().optional(),
});

const HooksJsonSchema = z.looseObject({
  hooks: z.record(z.string(), z.array(HookGroupSchema)).optional(),
  statusLine: StatusLineSchema.nullish(),
});

type HookEntry = z.infer<typeof HookEntrySchema>;
type HookGroup = z.infer<typeof HookGroupSchema>;
export type HooksJson = z.infer<typeof HooksJsonSchema>;
export type ManagedEvent = { event: string; matcher?: string };

export type ManagedHooksOptions = {
  layout: HookLayout;
  /** In the unit the harness reads: 5 for seconds, 5000 for Gemini's milliseconds. */
  timeout: number;
  /** The quoted script path every entry of agn's carries, whatever else its command says. */
  marker: string;
};

/** Cursor and Copilot refuse a hook config without it, and neither has moved past 1. */
const SCHEMA_VERSION = 1;

export async function readHooksJson(file: string): Promise<HooksJson> {
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) {
    return {};
  }
  const parsed = HooksJsonSchema.safeParse(parseJson(text, file));
  if (!parsed.success) {
    throw configUnreadable(file, parsed.error);
  }
  return parsed.data;
}

/** Writes only what a reinstall would change, so running an install per launch costs one read. */
export async function updateHooksJson(
  file: string,
  next: (config: HooksJson) => HooksJson,
): Promise<boolean> {
  const config = await readHooksJson(file);
  const updated = next(config);
  if (stableJson(updated) === stableJson(config)) {
    return false;
  }
  await writeConfigFile(file, `${JSON.stringify(updated, null, 2)}\n`);
  return true;
}

/**
 * agn's entries for exactly these events, and no others. Ours are recognised by the script path in
 * the command, so a reinstall replaces them wherever they sit - including under an event agn has
 * stopped installing - and the user's own entries stay put.
 */
export function withManagedHooks(
  config: HooksJson,
  events: ManagedEvent[],
  command: (event: string) => string,
  opts: ManagedHooksOptions,
): HooksJson {
  const swept = withoutManagedHooks(config, opts.marker);
  const hooks = { ...swept.hooks };
  for (const { event, matcher } of events) {
    hooks[event] = [...(hooks[event] ?? []), entryFor(command(event), matcher, opts)];
  }
  // Cursor and Copilot ignore a config with no version; a version the user pinned is theirs.
  const version = opts.layout === "claude" ? {} : { version: config.version ?? SCHEMA_VERSION };
  return { ...swept, ...version, hooks };
}

export function withoutManagedHooks(config: HooksJson, marker: string): HooksJson {
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(config.hooks ?? {})) {
    const kept = groups
      // A flat entry is one whole hook; a group holds its own, and keeps whatever is left of them.
      .filter((group) => !isOurs(group, marker))
      .map((group) =>
        group.hooks === undefined
          ? group
          : { ...group, hooks: group.hooks.filter((entry) => !isOurs(entry, marker)) },
      )
      // An event whose every entry was ours is a line the user never wrote, so it goes too.
      .filter((group) => group.hooks === undefined || group.hooks.length > 0);
    if (kept.length > 0) {
      hooks[event] = kept;
    }
  }
  // A file with no hooks left keeps none of the key: what is there is what the user put there.
  const { hooks: _ours, ...rest } = config;
  return Object.keys(hooks).length === 0 ? rest : { ...rest, hooks };
}

/** Each layout reads the command from a different key, and all three carry the script path. */
function isOurs(entry: HookEntry, marker: string): boolean {
  return [entry.command, entry.bash].some((value) => value?.includes(marker) === true);
}

function entryFor(
  command: string,
  matcher: string | undefined,
  opts: ManagedHooksOptions,
): HookGroup {
  const named = matcher === undefined ? {} : { matcher };
  switch (opts.layout) {
    case "claude":
      return { ...named, hooks: [{ type: "command", command, timeout: opts.timeout }] };
    case "cursor":
      return { ...named, command };
    case "copilot":
      return { ...named, type: "command", bash: command, timeoutSec: opts.timeout };
  }
}

/**
 * Key order is not content. A parsed config comes back with the keys agn names first, whatever
 * order the file had, so the comparison that decides whether to write sorts both sides.
 */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, raw: unknown) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return raw;
    }
    const entries = Object.entries(raw as Record<string, unknown>);
    return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
  });
}

function parseJson(text: string, file: string): unknown {
  // An empty file is a file the harness created and never wrote to; it holds no hooks.
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw configUnreadable(file, cause);
  }
}
