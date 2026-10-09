import {
  type AgnosticPaths,
  CatalogStaleDaysSchema,
  ColorModeSchema,
  DEFAULT_APPEARANCE,
  DEFAULT_CATALOG_STALE_DAYS,
  DEFAULT_TERMINAL_SIZE,
  EditorIdSchema,
  type MachineConfig,
  PlansSchema,
  ProfileIdSchema,
  readYamlFile,
  TerminalFontSchema,
  TerminalSizeSchema,
  ThemeIdSchema,
} from "@agnostic/core";
import { z } from "zod";

// A ceiling in dollars per window; a limit of zero would refuse everything, so it is not one.
const BudgetFileSchema = z.strictObject({
  daily_usd: z.number().positive().optional(),
  weekly_usd: z.number().positive().optional(),
});

// `user` is every Claude Code session on the machine; `repo` keeps agn out of the user's own
// settings file, so only the sessions agn starts report their limits.
const HooksFileSchema = z.strictObject({
  claude_statusline: z.enum(["user", "repo"]).optional(),
});

// The workspace's Settings writes these two; the CLI reads neither, but one file is one file.
const AppearanceFileSchema = z.strictObject({
  theme: ThemeIdSchema.optional(),
  mode: ColorModeSchema.optional(),
});

const TerminalFileSchema = z.strictObject({
  font: TerminalFontSchema.optional(),
  size: TerminalSizeSchema.optional(),
});

// Strict: a misspelled key must be an error, not a port silently back at the default.
const DaemonConfigFileSchema = z.strictObject({
  port: z.number().int().min(1).max(65535).optional(),
  plans: PlansSchema.optional(),
  editor: EditorIdSchema.optional(),
  catalog_check: z.boolean().optional(),
  spec_writer: ProfileIdSchema.optional(),
  budget: BudgetFileSchema.optional(),
  hooks: HooksFileSchema.optional(),
  appearance: AppearanceFileSchema.optional(),
  terminal: TerminalFileSchema.optional(),
  catalog_stale_days: CatalogStaleDaysSchema.optional(),
  spec_first: z.boolean().optional(),
});

/** Where agn installs Claude Code's status-line command, and so which sessions it captures. */
export type HooksConfig = MachineConfig["hooks"];

/** Null per window when the file sets no ceiling for it (ADR 036 Q8). */
export type BudgetConfig = MachineConfig["budget"];

export const HEADER = "agn machine settings. agn doctor --plan rewrites the plans section.";

const FIX_HINT = "Fix the file, or delete it to use the defaults.";

/**
 * `~/.agnostic/config.yaml` holds user settings for the machine, not for a repo: the port to bind,
 * the plan each vendor bills the user on, the editor `agn open` uses, whether the daily catalog
 * check runs, the spend ceiling, where agn installs Claude Code's status-line command, the
 * workspace's theme and terminal font, how old the catalog may get, and whether a new task writes
 * its spec first. The port and the check are read once at start and the rest per request. This
 * reader moves to core when a second component needs it.
 */
export async function readDaemonConfig(paths: AgnosticPaths): Promise<MachineConfig> {
  const file = await readYamlFile(paths.config, DaemonConfigFileSchema, FIX_HINT);
  return {
    port: file?.port ?? null,
    plans: file?.plans ?? {},
    editor: file?.editor ?? null,
    // Absent means on: the check is opt-out, so a file that says nothing about it keeps it.
    catalogCheck: file?.catalog_check ?? true,
    specWriter: file?.spec_writer ?? null,
    budget: {
      dailyUsd: file?.budget?.daily_usd ?? null,
      weeklyUsd: file?.budget?.weekly_usd ?? null,
    },
    // Absent means user scope: agn captures every session unless the user opts out.
    hooks: { claudeStatusline: file?.hooks?.claude_statusline ?? "user" },
    appearance: {
      theme: file?.appearance?.theme ?? DEFAULT_APPEARANCE.theme,
      mode: file?.appearance?.mode ?? DEFAULT_APPEARANCE.mode,
    },
    // No font is the page's own mono stack, which is what the workspace drew before this key.
    terminal: {
      font: file?.terminal?.font ?? null,
      size: file?.terminal?.size ?? DEFAULT_TERMINAL_SIZE,
    },
    catalogStaleDays: file?.catalog_stale_days ?? DEFAULT_CATALOG_STALE_DAYS,
    // Absent means off: a new task starts from the prompt alone unless the user asked otherwise.
    specFirst: file?.spec_first ?? false,
  };
}
