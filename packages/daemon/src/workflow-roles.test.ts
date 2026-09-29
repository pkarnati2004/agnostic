import type { Profile, Workflow, WorkflowRole } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import type { Detection } from "./detection-cache.js";
import { fixtureCatalog, fixtureDetection } from "./test-detection.js";
import { recommendContext } from "./test-recommend-context.js";
import { resolveWorkflowRoles } from "./workflow-roles.js";

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

function role(over: Partial<WorkflowRole> = {}): WorkflowRole {
  return {
    name: "developer",
    class: "implement",
    profile: null,
    instructions: "Implement the architect's plan.",
    ...over,
  };
}

function tiered(...roles: WorkflowRole[]): Workflow {
  return { name: "tiered", description: null, roles };
}

async function resolve(detection: Detection, workflows: Workflow[]) {
  const { ctx, repo, ledger, close } = await recommendContext(detection, await fixtureCatalog());
  cleanup = close;
  const answer = await resolveWorkflowRoles(ctx, repo, workflows);
  return { ...answer, ledger };
}

/** One profile the machine knows about and cannot use: logged out, or its key is gone. */
function withUnavailable(id: string, detection: Detection): Detection {
  const profiles: Profile[] = detection.profiles.map((profile) =>
    profile.id === id ? { ...profile, available: false } : profile,
  );
  return { ...detection, profiles };
}

describe("resolveWorkflowRoles", () => {
  it("asks the recommender for a role with no pin, and parses what it picked", async () => {
    const { resolved, roles } = await resolve(fixtureDetection(), [tiered(role())]);
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      workflow: "tiered",
      role: "developer",
      class: "implement",
      pinned: null,
      via: "recommended",
      reason: null,
      harness: "claude-code",
    });
    expect(roles[0]?.profile).toBe(`claude-code:${roles[0]?.model ?? "default"}:native`);
    expect(resolved[0]?.roles[0]?.profile).toBe(roles[0]?.profile);
  });

  it("uses a pin the machine can run, and asks nothing", async () => {
    const pin = "claude-code:sonnet-4.5:native";
    const { roles } = await resolve(fixtureDetection(), [tiered(role({ profile: pin }))]);
    expect(roles[0]).toMatchObject({
      pinned: pin,
      profile: pin,
      via: "pinned",
      model: "sonnet-4.5",
      reason: null,
    });
  });

  it("replaces a pin that is there and not available, and says so", async () => {
    const pin = "claude-code:sonnet-4.5:native";
    const detection = withUnavailable(pin, fixtureDetection());
    const { roles } = await resolve(detection, [tiered(role({ profile: pin }))]);
    expect(roles[0]).toMatchObject({
      pinned: pin,
      profile: "claude-code:default:native",
      via: "replaced",
      reason: `${pin} is not available (not logged in, or no key)`,
    });
  });

  it("replaces a pin for a profile this machine does not have", async () => {
    const pin = "codex:gpt-5:native";
    const { roles } = await resolve(fixtureDetection(), [tiered(role({ profile: pin }))]);
    expect(roles[0]).toMatchObject({
      pinned: pin,
      harness: "claude-code",
      via: "replaced",
      reason: `${pin} is not a profile on this machine`,
    });
  });

  it("records no recommendation.made: a sync decides nothing about a task", async () => {
    const { ledger } = await resolve(fixtureDetection(), [
      tiered(role(), role({ name: "reviewer", class: "review", instructions: null })),
    ]);
    expect(ledger.events.after(0).map((event) => event.kind)).not.toContain("recommendation.made");
  });

  it("passes the recommender's refusal through when nothing here can run the role", async () => {
    const detection: Detection = { ...fixtureDetection(), profiles: [] };
    await expect(resolve(detection, [tiered(role())])).rejects.toMatchObject({
      code: "no-eligible-profile",
    });
  });

  it("keeps one row per role, in file order, across workflows", async () => {
    const { roles } = await resolve(fixtureDetection(), [
      tiered(role({ name: "architect", class: "research" }), role()),
      { name: "audit", description: null, roles: [role({ name: "auditor" })] },
    ]);
    expect(roles.map((row) => `${row.workflow}/${row.role}`)).toEqual([
      "tiered/architect",
      "tiered/developer",
      "audit/auditor",
    ]);
  });
});
