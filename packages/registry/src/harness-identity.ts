import type { HarnessId, PlanVendor } from "@agnostic/core";

/**
 * What a harness is called and what it looks like: the three facts that belong to the harness
 * itself rather than to how agn starts it. This is the one file that writes them, and the one file
 * in the registry a web page may import, so nothing here reads the disk or parses anything.
 */
export type HarnessIdentity = {
  id: HarnessId;
  name: string;
  mark: string;
  /** The vendor whose plan bills this harness; null for one billed per provider key (ADR 016). */
  vendor: PlanVendor | null;
};

/** `mark` is set only where the harness has a letter of its own; `vendor` only where a plan bills it. */
type IdentitySource = { id: HarnessId; name: string; mark?: string; vendor?: PlanVendor };

/** Registry order, which is the order `harnesses` is built in: full rows, families, tier 2. */
const SOURCES: IdentitySource[] = [
  { id: "claude-code", name: "Claude Code", mark: "C", vendor: "claude" },
  { id: "codex", name: "Codex CLI", mark: "X", vendor: "chatgpt" },
  { id: "pi", name: "Pi", mark: "π" },
  { id: "opencode", name: "OpenCode", mark: "O" },
  { id: "gemini", name: "Gemini CLI", mark: "G", vendor: "google" },
  { id: "droid", name: "Factory Droid" },
  { id: "cursor-agent", name: "Cursor Agent", vendor: "cursor" },
  { id: "kimi", name: "Kimi CLI", vendor: "moonshot" },
  { id: "devin", name: "Devin CLI" },
  { id: "openclaude", name: "OpenClaude" },
  { id: "command-code", name: "Command Code" },
  { id: "omp", name: "OMP" },
  { id: "mimo-code", name: "Mimo Code" },
  { id: "grok", name: "Grok CLI", vendor: "xai" },
  { id: "copilot", name: "GitHub Copilot CLI" },
  { id: "autohand", name: "Autohand" },
  { id: "antigravity", name: "Antigravity" },
  { id: "aider", name: "Aider" },
  { id: "goose", name: "Goose" },
  { id: "amp", name: "Amp" },
  { id: "kilo", name: "Kilocode" },
  { id: "kiro", name: "Kiro" },
  { id: "crush", name: "Crush" },
  { id: "aug", name: "Auggie" },
  { id: "cline", name: "Cline" },
  { id: "codebuff", name: "Codebuff" },
  { id: "continue", name: "Continue" },
  { id: "mistral-vibe", name: "Mistral Vibe" },
  { id: "qwen-code", name: "Qwen Code" },
  { id: "rovo", name: "Rovo Dev" },
  { id: "hermes", name: "Hermes" },
  { id: "openclaw", name: "OpenClaw" },
  { id: "ante", name: "Ante" },
  { id: "trae", name: "Trae CLI" },
  { id: "prime-agent", name: "Prime Agent" },
  { id: "mastracode", name: "Mastra Code" },
  { id: "fx", name: "fx" },
  { id: "deepseek", name: "DeepSeek CLI" },
];

export const harnessIdentities: readonly HarnessIdentity[] = SOURCES.map((source) => ({
  id: source.id,
  name: source.name,
  mark: source.mark ?? defaultMark(source.id),
  vendor: source.vendor ?? null,
}));

const byId = new Map(harnessIdentities.map((identity) => [identity.id, identity]));

const OTHER_PREFIX = "other:";

/**
 * An id agn has no row for is still something it can name: `other:ralph` is agn saying only "an
 * executable I know nothing else about", so the executable's own name is the name and the mark.
 */
export function harnessIdentity(id: HarnessId): HarnessIdentity {
  const known = byId.get(id);
  if (known !== undefined) {
    return known;
  }
  const binary = id.startsWith(OTHER_PREFIX) ? id.slice(OTHER_PREFIX.length) : id;
  return { id, name: binary, mark: defaultMark(binary), vendor: null };
}

/**
 * The harness a vendor's plan bills for, so one company reads as one mark across the page. Null
 * only for a vendor no row claims, which a registry test rules out; the page draws its neutral
 * mark for that as it does for a harness with no plan vendor at all.
 */
export function harnessForVendor(vendor: PlanVendor): HarnessIdentity | null {
  return harnessIdentities.find((identity) => identity.vendor === vendor) ?? null;
}

/** First letter upper-cased plus the second as written: grok → Gr, fx → Fx. */
function defaultMark(id: string): string {
  return id.slice(0, 1).toUpperCase() + id.slice(1, 2);
}
