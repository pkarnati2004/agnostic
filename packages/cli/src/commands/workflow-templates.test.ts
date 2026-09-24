import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agPaths, readWorkflow, type Workflow, workflowPath } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEMPLATE_IDS, workflowTemplate } from "./workflow-templates.js";

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "agn-workflow-template-"));
  await mkdir(agPaths(repo).workflowsDir, { recursive: true });
});

afterEach(() => rm(repo, { recursive: true, force: true }));

/** The templates are checked the way a user meets them: written to disk, then read back. */
async function written(template: "single" | "tiered", name: string): Promise<Workflow> {
  await writeFile(workflowPath(repo, name), workflowTemplate(template, name), "utf8");
  const workflow = await readWorkflow(repo, name);
  if (workflow === null) {
    throw new Error(`${name}.yaml was not written`);
  }
  return workflow;
}

describe("workflowTemplate", () => {
  it("offers the three templates the docs name", () => {
    expect(TEMPLATE_IDS).toEqual(["none", "single", "tiered"]);
  });

  it("writes the single template with one developer role", async () => {
    const workflow = await written("single", "dev");
    expect(workflow.name).toBe("dev");
    expect(workflow.roles.map((role) => [role.name, role.class])).toEqual([
      ["developer", "implement"],
    ]);
    expect(workflow.roles[0]?.profile).toBeNull();
    expect(workflow.roles[0]?.instructions).toContain("Implement exactly what the task asks.");
  });

  it("writes the tiered template with the four ruled roles in order", async () => {
    const workflow = await written("tiered", "tiered");
    expect(workflow.roles.map((role) => [role.name, role.class])).toEqual([
      ["architect", "research"],
      ["developer", "implement"],
      ["test-writer", "implement"],
      ["reviewer", "review"],
    ]);
    expect(workflow.description).toBe("Plan, implement, test and review, each by its own role.");
  });

  it("leaves the profile pin commented out, so agn picks one per class", async () => {
    expect(workflowTemplate("single", "dev")).toContain("# profile: claude-code:sonnet:native");
    expect(workflowTemplate("tiered", "tiered")).toContain("# profile: codex:default:native");
    const workflow = await written("tiered", "tiered");
    expect(workflow.roles.every((role) => role.profile === null)).toBe(true);
  });

  it("substitutes the name and changes nothing else", () => {
    const named = workflowTemplate("tiered", "review-heavy");
    expect(named).toContain("name: review-heavy\n");
    expect(named.replace("name: review-heavy", "name: tiered")).toBe(
      workflowTemplate("tiered", "tiered"),
    );
  });
});
