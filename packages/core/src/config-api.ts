import { z } from "zod";
import { type Appearance, COLOR_MODES, type TerminalConfig, THEME_IDS } from "./appearance.js";
import { type EditorId, EditorIdSchema } from "./editor.js";
import type { Plans } from "./plans.js";
import { ProfileIdSchema } from "./profile.js";

export const ThemeIdSchema = z.enum(THEME_IDS);
export const ColorModeSchema = z.enum(COLOR_MODES);

/** A family name as the browser resolves it, not a stack: the page puts it in front of its own. */
export const TerminalFontSchema = z.string().trim().min(1).max(64);

export const TerminalSizeSchema = z.number().int().min(8).max(32);

/** A year is the longest wait worth offering; zero days would call every catalog stale at once. */
export const CatalogStaleDaysSchema = z.number().int().min(1).max(365);

/** The file as the daemon reads it; null where it says nothing and no default applies. */
export type MachineConfig = {
  port: number | null;
  plans: Plans;
  editor: EditorId | null;
  catalogCheck: boolean;
  specWriter: string | null;
  budget: { dailyUsd: number | null; weeklyUsd: number | null };
  hooks: { claudeStatusline: "user" | "repo" };
  appearance: Appearance;
  terminal: TerminalConfig;
  /** How old the catalog may be before the workspace draws the stale notice. */
  catalogStaleDays: number;
  /** What the New task tab's "Write the spec first" toggle starts as. */
  specFirst: boolean;
};

export type ConfigResponse = { config: MachineConfig; file: string };

/**
 * Keys present are merged, null clears, absent keys are kept. `port` is read once at start and
 * stays a hand edit; `plans` are written by `POST /doctor`, which re-detects.
 */
export const ConfigPatchRequestSchema = z.strictObject({
  editor: EditorIdSchema.nullable().optional(),
  catalogCheck: z.boolean().optional(),
  specWriter: ProfileIdSchema.nullable().optional(),
  budget: z
    .strictObject({
      dailyUsd: z.number().positive().nullable().optional(),
      weeklyUsd: z.number().positive().nullable().optional(),
    })
    .optional(),
  hooks: z.strictObject({ claudeStatusline: z.enum(["user", "repo"]) }).optional(),
  appearance: z
    .strictObject({ theme: ThemeIdSchema.optional(), mode: ColorModeSchema.optional() })
    .optional(),
  terminal: z
    .strictObject({
      font: TerminalFontSchema.nullable().optional(),
      size: TerminalSizeSchema.optional(),
    })
    .optional(),
  catalogStaleDays: CatalogStaleDaysSchema.optional(),
  specFirst: z.boolean().optional(),
});

export type ConfigPatchRequest = z.infer<typeof ConfigPatchRequestSchema>;
