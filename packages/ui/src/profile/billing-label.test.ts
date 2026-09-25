import type { Billing } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { billingLabel } from "./billing-label";

describe("billingLabel", () => {
  it("says what each way of paying is called", () => {
    const labels: [Billing, string | null][] = [
      ["subscription", "included in plan"],
      ["credits", "credits"],
      ["api-key", "API key"],
      ["local", "local"],
      // A plan agn cannot name says nothing: a badge reading "unknown" tells the reader nothing.
      ["unknown", null],
    ];
    for (const [billing, label] of labels) {
      expect(billingLabel(billing)).toBe(label);
    }
  });
});
