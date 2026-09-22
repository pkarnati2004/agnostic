import type { HarnessId } from "@agnostic/core";
import { claudeCodeInstaller } from "./claude-code/install.js";
import { claudeCodeParser } from "./claude-code/parse.js";
import { codexInstaller } from "./codex/install.js";
import { codexParser } from "./codex/parse.js";
import type { HookEventParser } from "./hook-event-parser.js";
import type { HookInstaller } from "./hook-installer.js";
import { commandCodeInstaller, commandCodeParser } from "./settings-json/command-code.js";
import { cursorAgentInstaller, cursorAgentParser } from "./settings-json/cursor-agent.js";
import { devinInstaller, devinParser } from "./settings-json/devin.js";
import { droidInstaller, droidParser } from "./settings-json/droid.js";
import { geminiInstaller, geminiParser } from "./settings-json/gemini.js";
import { kimiInstaller, kimiParser } from "./settings-json/kimi.js";
import { openClaudeInstaller, openClaudeParser } from "./settings-json/openclaude.js";

/**
 * The two rows a harness with a status hook has. Nothing outside this file names a harness: the
 * daemon asks for whatever the id it was given has, and gets null for the ones that have nothing.
 */
const installers: Partial<Record<HarnessId, HookInstaller>> = {
  "claude-code": claudeCodeInstaller,
  codex: codexInstaller,
  "command-code": commandCodeInstaller,
  "cursor-agent": cursorAgentInstaller,
  devin: devinInstaller,
  droid: droidInstaller,
  gemini: geminiInstaller,
  kimi: kimiInstaller,
  openclaude: openClaudeInstaller,
};

const parsers: Partial<Record<HarnessId, HookEventParser>> = {
  "claude-code": claudeCodeParser,
  codex: codexParser,
  "command-code": commandCodeParser,
  "cursor-agent": cursorAgentParser,
  devin: devinParser,
  droid: droidParser,
  gemini: geminiParser,
  kimi: kimiParser,
  openclaude: openClaudeParser,
};

export function hookInstaller(harness: HarnessId): HookInstaller | null {
  return installers[harness] ?? null;
}

export function hookParser(harness: HarnessId): HookEventParser | null {
  return parsers[harness] ?? null;
}
