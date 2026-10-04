import type { PlanVendor } from "@agnostic/core";
import type { VendorOf } from "./catalog-schema.js";

/** The registry's vendor rows, written out here because the catalog cannot import the registry. */
const VENDORS: Record<string, PlanVendor> = {
  "claude-code": "claude",
  codex: "chatgpt",
  gemini: "google",
  grok: "xai",
  kimi: "moonshot",
  "cursor-agent": "cursor",
};

export const testVendorOf: VendorOf = (harness) => VENDORS[harness] ?? null;
