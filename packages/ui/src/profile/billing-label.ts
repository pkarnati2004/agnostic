import type { Billing } from "@agnostic/core";

/** What a profile costs, in the words the usage bar and the docs use. Null for a plan agn cannot
 * name: a badge that said "unknown" would tell the reader nothing. */
export function billingLabel(billing: Billing): string | null {
  switch (billing) {
    case "subscription":
      return "included in plan";
    case "credits":
      return "credits";
    case "api-key":
      return "API key";
    case "local":
      return "local";
    case "unknown":
      return null;
  }
}
