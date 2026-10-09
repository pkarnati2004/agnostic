import {
  type AgnosticPaths,
  type ConfigPatchRequest,
  DEFAULT_APPEARANCE,
  DEFAULT_CATALOG_STALE_DAYS,
  DEFAULT_TERMINAL_SIZE,
  type MachineConfig,
  type Plans,
  writeYamlFile,
} from "@agnostic/core";
import { HEADER, readDaemonConfig } from "./daemon-config.js";

/** `plans` is doctor's alone: it re-detects, so no route offers it on the config body. */
export type ConfigPatch = ConfigPatchRequest & { plans?: Plans };

/**
 * Reads the file through its own schema, merges the patch over it, and writes the result back.
 * A key the patch leaves out keeps what was on file, a null clears it, and a key sitting at its
 * default is not written at all, so a rewrite never adds a line the user did not ask for. The
 * file is rebuilt from its parsed contents, so a comment in it does not survive being edited.
 */
export async function writeDaemonConfig(
  paths: AgnosticPaths,
  patch: ConfigPatch,
): Promise<MachineConfig> {
  const config = merge(await readDaemonConfig(paths), patch);
  await writeYamlFile(paths.config, serialize(config), HEADER);
  return config;
}

function merge(current: MachineConfig, patch: ConfigPatch): MachineConfig {
  return {
    // The daemon has already bound a port, so a change here would only confuse the running one.
    port: current.port,
    plans: patch.plans === undefined ? current.plans : { ...current.plans, ...patch.plans },
    editor: kept(patch.editor, current.editor),
    catalogCheck: patch.catalogCheck ?? current.catalogCheck,
    specWriter: kept(patch.specWriter, current.specWriter),
    budget: {
      dailyUsd: kept(patch.budget?.dailyUsd, current.budget.dailyUsd),
      weeklyUsd: kept(patch.budget?.weeklyUsd, current.budget.weeklyUsd),
    },
    hooks: { claudeStatusline: patch.hooks?.claudeStatusline ?? current.hooks.claudeStatusline },
    appearance: {
      theme: patch.appearance?.theme ?? current.appearance.theme,
      mode: patch.appearance?.mode ?? current.appearance.mode,
    },
    terminal: {
      font: kept(patch.terminal?.font, current.terminal.font),
      size: patch.terminal?.size ?? current.terminal.size,
    },
    catalogStaleDays: patch.catalogStaleDays ?? current.catalogStaleDays,
    specFirst: patch.specFirst ?? current.specFirst,
  };
}

/** Absent leaves the file's value alone; null is the user clearing the key. */
function kept<T>(value: T | null | undefined, current: T | null): T | null {
  return value === undefined ? current : value;
}

/** The yaml body: snake_case names, and only the keys that say something a default would not. */
function serialize(config: MachineConfig): Record<string, unknown> {
  const file: Record<string, unknown> = {};
  if (Object.keys(config.plans).length > 0) {
    file.plans = config.plans;
  }
  if (config.port !== null) {
    file.port = config.port;
  }
  if (config.editor !== null) {
    file.editor = config.editor;
  }
  if (!config.catalogCheck) {
    file.catalog_check = false;
  }
  if (config.specWriter !== null) {
    file.spec_writer = config.specWriter;
  }
  const budget = budgetSection(config.budget);
  if (budget !== null) {
    file.budget = budget;
  }
  if (config.hooks.claudeStatusline !== "user") {
    file.hooks = { claude_statusline: config.hooks.claudeStatusline };
  }
  const appearance = appearanceSection(config.appearance);
  if (appearance !== null) {
    file.appearance = appearance;
  }
  const terminal = terminalSection(config.terminal);
  if (terminal !== null) {
    file.terminal = terminal;
  }
  if (config.catalogStaleDays !== DEFAULT_CATALOG_STALE_DAYS) {
    file.catalog_stale_days = config.catalogStaleDays;
  }
  if (config.specFirst) {
    file.spec_first = true;
  }
  return file;
}

/** Written back only when the user set a ceiling, so the rewrite adds no key they never wrote. */
function budgetSection(budget: MachineConfig["budget"]): Record<string, number> | null {
  const section: Record<string, number> = {};
  if (budget.dailyUsd !== null) {
    section.daily_usd = budget.dailyUsd;
  }
  if (budget.weeklyUsd !== null) {
    section.weekly_usd = budget.weeklyUsd;
  }
  return Object.keys(section).length === 0 ? null : section;
}

function appearanceSection(appearance: MachineConfig["appearance"]): Record<string, string> | null {
  const section: Record<string, string> = {};
  if (appearance.theme !== DEFAULT_APPEARANCE.theme) {
    section.theme = appearance.theme;
  }
  if (appearance.mode !== DEFAULT_APPEARANCE.mode) {
    section.mode = appearance.mode;
  }
  return Object.keys(section).length === 0 ? null : section;
}

function terminalSection(
  terminal: MachineConfig["terminal"],
): Record<string, string | number> | null {
  const section: Record<string, string | number> = {};
  if (terminal.font !== null) {
    section.font = terminal.font;
  }
  if (terminal.size !== DEFAULT_TERMINAL_SIZE) {
    section.size = terminal.size;
  }
  return Object.keys(section).length === 0 ? null : section;
}
