import { describe, expect, it } from "vitest";
import { DoctorRequestSchema } from "./doctor-api.js";
import { PlansSchema, PlanVendorSchema } from "./plans.js";

describe("PlansSchema", () => {
  it("takes a plan name per vendor, whatever the name is", () => {
    expect(PlansSchema.parse({ claude: "max20", chatgpt: "plus" })).toEqual({
      claude: "max20",
      chatgpt: "plus",
    });
    // The catalog decides which names mean something; the schema only says who bills.
    expect(PlansSchema.parse({ claude: "startup" })).toEqual({ claude: "startup" });
    expect(PlansSchema.parse({})).toEqual({});
  });

  it("refuses a vendor that does not bill by plan, and an empty name", () => {
    expect(PlansSchema.safeParse({ codex: "plus" }).success).toBe(false);
    expect(PlansSchema.safeParse({ claude: "" }).success).toBe(false);
    expect(PlanVendorSchema.safeParse("openai").success).toBe(false);
  });
});

describe("DoctorRequestSchema", () => {
  it("takes an empty body, which is `agn doctor` with nothing to say", () => {
    expect(DoctorRequestSchema.parse({})).toEqual({});
    expect(DoctorRequestSchema.parse({ plans: { claude: "pro" } })).toEqual({
      plans: { claude: "pro" },
    });
    expect(DoctorRequestSchema.safeParse({ plan: "pro" }).success).toBe(false);
  });
});
