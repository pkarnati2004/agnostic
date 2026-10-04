import type { DoctorRequest, DoctorResponse, HarnessReport } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { unknownPlans } from "./doctor-plan.js";

function report(over: Partial<HarnessReport>): HarnessReport {
  return {
    harness: "claude-code",
    name: "Claude Code",
    binary: "claude",
    path: "/opt/bin/claude",
    version: "2.0.1",
    login: "logged-in",
    billing: "subscription",
    tier: 1,
    support: "full",
    models: [],
    modelSource: "none",
    planVendor: "claude",
    limitSource: "statusline",
    usageSource: "transcripts",
    plan: null,
    limitCapture: "none",
    ...over,
  };
}

function response(harnesses: HarnessReport[], plans: DoctorResponse["plans"] = {}): DoctorResponse {
  return {
    harnesses,
    profiles: [],
    tools: [],
    named: [],
    detectedAt: "2026-09-12T10:00:00.000Z",
    pathVar: "/opt/bin",
    plans,
    tmuxConfigStale: false,
    planOptions: [
      { vendor: "claude", id: "pro", displayName: "Pro" },
      { vendor: "claude", id: "max20", displayName: "Max 20x" },
    ],
  };
}

/** A daemon that records what it was asked and answers with the plan it was told, once told. */
function daemon(first: DoctorResponse, second = first) {
  const requests: Array<DoctorRequest | undefined> = [];
  return {
    requests,
    client: {
      doctor: (request?: DoctorRequest) => {
        requests.push(request);
        return Promise.resolve(requests.length === 1 ? first : second);
      },
    },
  };
}

const unknown = response([report({})]);
const known = response(
  [
    report({
      plan: { value: "max20", source: "config", known: true, confirmed: true, overridden: null },
    }),
  ],
  {
    claude: "max20",
  },
);

describe("agn doctor --plan", () => {
  it("sends the plan the user named, and shows what came back", async () => {
    const { requests, client } = daemon(known);
    const cli = createTestContext({ client });
    expect(await runMain(argv("--plan", "claude=max20"), cli.ctx)).toBe(0);
    expect(requests).toEqual([{ plans: { claude: "max20" } }]);
    expect(cli.out.join("\n")).toContain("max20 (config)");
  });

  it("takes one flag per vendor", async () => {
    const { requests, client } = daemon(known);
    const cli = createTestContext({ client });
    await runMain(argv("--plan", "claude=max20", "--plan", "chatgpt=plus"), cli.ctx);
    expect(requests).toEqual([{ plans: { claude: "max20", chatgpt: "plus" } }]);
  });

  it("takes every vendor that bills a CLI by plan", async () => {
    const { requests, client } = daemon(unknown);
    const cli = createTestContext({ client });
    expect(
      await runMain(
        argv("--plan", "google=ai-pro", "--plan", "xai=supergrok", "--plan", "cursor=pro"),
        cli.ctx,
      ),
    ).toBe(0);
    expect(requests).toEqual([{ plans: { google: "ai-pro", xai: "supergrok", cursor: "pro" } }]);
  });

  it("refuses a vendor it does not bill for, and says which it does", async () => {
    for (const flag of ["nope=pro", "claude", "claude="]) {
      const cli = createTestContext({ client: daemon(unknown).client });
      expect(await runMain(argv("--plan", flag), cli.ctx)).toBe(2);
      expect(cli.err.join("\n")).toContain("claude, chatgpt, google, xai, moonshot, cursor");
    }
  });

  it("passes a plan the catalog has never heard of straight through", async () => {
    const notInCatalog = response([
      report({
        plan: { value: "max50", source: "config", known: false, confirmed: true, overridden: null },
      }),
    ]);
    const { requests, client } = daemon(notInCatalog);
    const cli = createTestContext({ client });
    await runMain(argv("--plan", "claude=max50"), cli.ctx);
    expect(requests).toEqual([{ plans: { claude: "max50" } }]);
    expect(cli.out.join("\n")).toContain("max50 (not in catalog)");
  });

  it("says which detected plan the configured one stood in for", async () => {
    const overridden = response([
      report({
        plan: {
          value: "max20",
          source: "config",
          known: true,
          confirmed: true,
          overridden: "max50",
        },
      }),
    ]);
    const cli = createTestContext({ client: daemon(overridden).client });
    await runMain(argv(), cli.ctx);
    expect(cli.out.join("\n")).toContain("max20 (detected max50 not in catalog)");
  });

  it("names the flag and the plans the catalog knows when nobody is there to ask", async () => {
    const cli = createTestContext({ client: daemon(unknown).client });
    await runMain(argv(), cli.ctx);
    expect(cli.out).toContain("plan unknown for claude-code: agn doctor --plan claude=<pro|max20>");
  });

  it("asks on a terminal, and sends the answer to the same endpoint", async () => {
    const { requests, client } = daemon(unknown, known);
    const cli = createTestContext({ client, stdin: ["2"] });
    await runMain(argv(), cli.ctx);
    expect(cli.out).toContain("  1) Pro");
    expect(cli.out).toContain("  2) Max 20x");
    expect(cli.out).toContain("  3) other");
    expect(requests).toEqual([undefined, { plans: { claude: "max20" } }]);
    // The table is printed again, so the user sees the answer take effect.
    expect(cli.out.filter((line) => line.startsWith("harness"))).toHaveLength(2);
  });

  it("takes a plan the catalog does not list when the user picks other", async () => {
    const { requests, client } = daemon(unknown);
    const cli = createTestContext({ client, stdin: ["3", "startup"] });
    await runMain(argv(), cli.ctx);
    expect(requests).toEqual([undefined, { plans: { claude: "startup" } }]);
  });

  it("takes the plan's own name as well as its number", async () => {
    const { requests, client } = daemon(unknown, known);
    const cli = createTestContext({ client, stdin: ["max20"] });
    await runMain(argv(), cli.ctx);
    expect(requests).toEqual([undefined, { plans: { claude: "max20" } }]);
  });

  it("records nothing for an answer it does not recognise, and says so", async () => {
    const { requests, client } = daemon(unknown);
    const cli = createTestContext({ client, stdin: ["dunno"] });
    await runMain(argv(), cli.ctx);
    expect(requests).toEqual([undefined]);
    expect(cli.out).toContain('"dunno" is not one of those, so no plan was recorded');
  });

  it("asks once and lets an empty answer stand", async () => {
    const { requests, client } = daemon(unknown);
    const cli = createTestContext({ client, stdin: [""] });
    await runMain(argv(), cli.ctx);
    expect(requests).toEqual([undefined]);
  });

  it("says nothing about plans in --json", async () => {
    const cli = createTestContext({ client: daemon(unknown).client });
    await runMain(argv("--json"), cli.ctx);
    expect(JSON.parse(cli.out.join("\n"))).toEqual(unknown);
  });

  it("asks again about a plan the harness's own models contradict", async () => {
    const doubted = response([
      report({
        plan: { value: "pro", source: "config", known: true, confirmed: false, overridden: null },
      }),
    ]);
    const cli = createTestContext({ client: daemon(doubted).client });
    await runMain(argv(), cli.ctx);
    expect(cli.out).toContain(
      "claude-code lists models that plan pro does not include: agn doctor --plan claude=<pro|max20>",
    );
  });

  it("says which plan it doubts when it asks on a terminal", async () => {
    const doubted = response([
      report({
        plan: { value: "pro", source: "config", known: true, confirmed: false, overridden: null },
      }),
    ]);
    const { requests, client } = daemon(doubted, known);
    const cli = createTestContext({ client, stdin: ["2"] });
    await runMain(argv(), cli.ctx);
    expect(cli.out).toContain(
      "which plan are you on for Claude Code? (config says pro, and its models say otherwise)",
    );
    expect(requests).toEqual([undefined, { plans: { claude: "max20" } }]);
  });

  it("names a vendor with no plan yet, and stops naming it once it has one", () => {
    const gemini = report({
      harness: "gemini",
      name: "Gemini CLI",
      binary: "gemini",
      path: "/opt/bin/gemini",
      support: "status",
      planVendor: "google",
    });
    expect(unknownPlans(response([gemini])).map((row) => row.harness)).toEqual(["gemini"]);
    const answered = report({
      ...gemini,
      plan: { value: "ai-pro", source: "config", known: true, confirmed: true, overridden: null },
    });
    expect(unknownPlans(response([answered]))).toEqual([]);
  });

  it("asks nothing when every plan is confirmed", async () => {
    const { requests, client } = daemon(known);
    const cli = createTestContext({ client, stdin: ["1"] });
    await runMain(argv(), cli.ctx);
    expect(requests).toEqual([undefined]);
    expect(cli.out.join("\n")).not.toContain("which plan");
  });
});

function argv(...args: string[]): string[] {
  return [process.execPath, "agn", "doctor", ...args];
}
