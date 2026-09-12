import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeConfigFile } from "./config-file.js";
import { configUnreadable } from "./error.js";

/**
 * The hook config shape Claude Code defined and Codex adopted: events, each holding groups of
 * command entries. Unknown keys survive a read and a write, because the file is the user's.
 */
const HookEntrySchema = z.looseObject({
  type: z.string(),
  command: z.string(),
  timeout: z.number().optional(),
});
const HookGroupSchema = z.looseObject({
  matcher: z.string().optional(),
  hooks: z.array(HookEntrySchema),
});
const HooksJsonSchema = z.looseObject({
  hooks: z.record(z.string(), z.array(HookGroupSchema)).optional(),
});

type HookGroup = z.infer<typeof HookGroupSchema>;
export type HooksJson = z.infer<typeof HooksJsonSchema>;
export type ManagedEvent = { event: string; matcher?: string };

const HOOK_TIMEOUT_SECONDS = 5;

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
  if (JSON.stringify(updated) === JSON.stringify(config)) {
    return false;
  }
  await writeConfigFile(file, `${JSON.stringify(updated, null, 2)}\n`);
  return true;
}

/**
 * agn's entries for exactly these events, and no others. Ours are recognised by the script path in
 * the command, so a reinstall replaces them wherever they sit and the user's own entries stay put.
 */
export function withManagedHooks(
  config: HooksJson,
  events: ManagedEvent[],
  command: string,
): HooksJson {
  const hooks = { ...withoutManagedHooks(config, command).hooks };
  for (const { event, matcher } of events) {
    const entry = { type: "command", command, timeout: HOOK_TIMEOUT_SECONDS };
    const group = { ...(matcher === undefined ? {} : { matcher }), hooks: [entry] };
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  return { ...config, hooks };
}

export function withoutManagedHooks(config: HooksJson, command: string): HooksJson {
  const marker = scriptMarker(command);
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(config.hooks ?? {})) {
    const kept = groups
      .map((group) => ({ ...group, hooks: group.hooks.filter((e) => !e.command.includes(marker)) }))
      .filter((group) => group.hooks.length > 0);
    // An event whose every entry was ours is a line the user never wrote, so it goes too.
    if (kept.length > 0) {
      hooks[event] = kept;
    }
  }
  return { ...config, hooks };
}

/** `sh '<script>' <harness>`: the quoted script path alone, so any harness's entry is recognised. */
function scriptMarker(command: string): string {
  const end = command.lastIndexOf("'");
  return end === -1 ? command : command.slice(0, end + 1);
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
