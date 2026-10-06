import type { HarnessId } from "@agnostic/core";
import { gateways } from "./gateways.js";

/** The key that lets a harness bill by API when its own login says nothing. */
const NATIVE_API_KEYS: Record<string, string> = {
  "claude-code": "ANTHROPIC_API_KEY",
  codex: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
  kimi: "MOONSHOT_API_KEY",
};

/** One variable and the harnesses it serves: a harness's own key, or a gateway's. */
export type ApiKeyVar = { name: string; usedBy: HarnessId[] };

/** Null for a harness with no key of its own, which is every one billed by a gateway alone. */
export function nativeApiKey(harness: HarnessId): string | null {
  return NATIVE_API_KEYS[harness] ?? null;
}

/**
 * Every variable the registry names, native keys first and then the gateways, each once. A key two
 * rows name - Moonshot is both kimi's own and Claude Code's gateway - keeps the first row's place
 * and collects both harnesses, so the Settings page lists one row per variable and not per use.
 */
export function apiKeyVars(): ApiKeyVar[] {
  const byName = new Map<string, HarnessId[]>();
  const add = (name: string, harnesses: readonly HarnessId[]) => {
    const used = byName.get(name);
    if (used === undefined) {
      byName.set(name, [...harnesses]);
      return;
    }
    used.push(...harnesses.filter((harness) => !used.includes(harness)));
  };
  for (const [harness, name] of Object.entries(NATIVE_API_KEYS)) {
    add(name, [harness]);
  }
  for (const gateway of gateways) {
    add(gateway.envKey, gateway.harnesses);
  }
  return [...byName].map(([name, usedBy]) => ({ name, usedBy }));
}
