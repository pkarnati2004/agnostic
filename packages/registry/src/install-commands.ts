import type { HarnessId } from "@agnostic/core";

/**
 * How to install each tier-1 harness, in the words its own quickstart uses (the same commands
 * `docs/setup.md` lists). Tier-2 harnesses have no row: agn launches them, it does not install
 * them, and a wrong command is worse than none.
 */
const COMMANDS: Partial<Record<HarnessId, string>> = {
  "claude-code": "npm i -g @anthropic-ai/claude-code",
  codex: "npm i -g @openai/codex",
  pi: "npm i -g @earendil-works/pi-coding-agent",
  opencode: "npm i -g opencode-ai",
};

/** null when agn has no command it is sure of, which is how a harness stays out of "worth trying". */
export function installCommand(harness: HarnessId): string | null {
  return COMMANDS[harness] ?? null;
}
