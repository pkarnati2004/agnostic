import {
  type AgnosticPaths,
  type EditorId,
  EditorIdSchema,
  type Plans,
  PlansSchema,
  ProfileIdSchema,
  readYamlFile,
  writeYamlFile,
} from "@agnostic/core";
import { z } from "zod";

// A ceiling in dollars per window; a limit of zero would refuse everything, so it is not one.
const BudgetFileSchema = z.strictObject({
  daily_usd: z.number().positive().optional(),
  weekly_usd: z.number().positive().optional(),
});

// Strict: a misspelled key must be an error, not a port silently back at the default.
const DaemonConfigFileSchema = z.strictObject({
  port: z.number().int().min(1).max(65535).optional(),
  plans: PlansSchema.optional(),
  editor: EditorIdSchema.optional(),
  catalog_check: z.boolean().optional(),
  spec_writer: ProfileIdSchema.optional(),
  budget: BudgetFileSchema.optional(),
});

/** Null per window when the file sets no ceiling for it (ADR 036 Q8). */
export type BudgetConfig = { dailyUsd: number | null; weeklyUsd: number | null };

type DaemonConfig = {
  port: number | null;
  plans: Plans;
  editor: EditorId | null;
  catalogCheck: boolean;
  /** The profile that writes specs, overriding the automatic choice (ADR 028). */
  specWriter: string | null;
  budget: BudgetConfig;
};

const HEADER = "agn machine settings. agn doctor --plan rewrites the plans section.";

const FIX_HINT = "Fix the file, or delete it to use the defaults.";

/**
 * `~/.agnostic/config.yaml` holds user settings for the machine, not for a repo: the port to bind,
 * the plan each vendor bills the user on, the editor `agn open` uses, whether the daily catalog
 * check runs, and the spend ceiling. The port and the check are read once at start and the rest
 * per request. This reader moves to core when a second component needs it.
 */
export async function readDaemonConfig(paths: AgnosticPaths): Promise<DaemonConfig> {
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
  };
}

/**
 * Records what the user told `agn doctor --plan`, one vendor at a time, keeping the port, the
 * editor, the catalog setting, the spec writer, the budget and the vendors they did not mention.
 * The file is rewritten from its parsed contents, so a comment in it does not survive being
 * edited this way.
 */
export async function writeDaemonConfigPlans(paths: AgnosticPaths, plans: Plans): Promise<Plans> {
  const current = await readDaemonConfig(paths);
  const merged: Plans = { ...current.plans, ...plans };
  const file: Record<string, unknown> = { plans: merged };
  if (current.port !== null) {
    file.port = current.port;
  }
  if (current.editor !== null) {
    file.editor = current.editor;
  }
  if (!current.catalogCheck) {
    file.catalog_check = false;
  }
  if (current.specWriter !== null) {
    file.spec_writer = current.specWriter;
  }
  const budget = budgetSection(current.budget);
  if (budget !== null) {
    file.budget = budget;
  }
  await writeYamlFile(paths.config, file, HEADER);
  return merged;
}

/** Written back only when the user set a ceiling, so the rewrite adds no key they never wrote. */
function budgetSection(budget: BudgetConfig): Record<string, number> | null {
  const section: Record<string, number> = {};
  if (budget.dailyUsd !== null) {
    section.daily_usd = budget.dailyUsd;
  }
  if (budget.weeklyUsd !== null) {
    section.weekly_usd = budget.weeklyUsd;
  }
  return Object.keys(section).length === 0 ? null : section;
}
