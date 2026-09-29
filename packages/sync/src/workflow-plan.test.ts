import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessId } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatedHeader } from "./generated-header.js";
import { agentFile, type ResolvedRole, type ResolvedWorkflow } from "./workflow-files.js";
import { planWorkflowSync, readWorkflowExisting } from "./workflow-plan.js";

const HEADER = generatedHeader(".ag/workflows/tiered.yaml");

function role(name: string, harness: HarnessId = "claude-code"): ResolvedRole {
  return {
    name,
    class: "implement",
    instructions: `Do ${name} work.`,
    profile: `${harness}:sonnet:native`,
    harness,
    model: "sonnet",
  };
}

function workflow(name: string, roles: ResolvedRole[]): ResolvedWorkflow {
  return { name, description: null, roles };
}

const TIERED = workflow("tiered", [role("developer"), role("reviewer", "codex")]);

function plan(
  workflows: ResolvedWorkflow[],
  existing: Record<string, string | null> = {},
  force = false,
) {
  return planWorkflowSync({ workflows, existing }, { force }).map(
    (write) => `${write.action} ${write.file}${write.reason === null ? "" : ` (${write.reason})`}`,
  );
}

describe("planWorkflowSync", () => {
  it("writes each workflow's agents before its command, and nothing for another harness", () => {
    expect(plan([TIERED, workflow("audit", [role("auditor")])])).toEqual([
      "create .claude/agents/developer.md",
      "create .claude/commands/tiered.md",
      "create .claude/agents/auditor.md",
      "create .claude/commands/audit.md",
    ]);
  });

  it("refuses one role name declared by two workflows", () => {
    expect(() => plan([TIERED, workflow("audit", [role("developer")])])).toThrowError(
      /role developer is declared in workflows tiered and audit/,
    );
  });

  it("leaves a file it already wrote alone, and rewrites one edited under its header", () => {
    const file = ".claude/agents/developer.md";
    const mine = agentFile(TIERED, role("developer")).content;
    expect(plan([TIERED], { [file]: mine })).toContain(`unchanged ${file}`);
    expect(plan([TIERED], { [file]: `${HEADER}\nedited\n` })).toContain(`update ${file}`);
  });

  it("refuses an agent file someone wrote by hand, until --force", () => {
    const file = ".claude/agents/developer.md";
    expect(plan([TIERED], { [file]: "mine\n" })).toContain(
      `conflict ${file} (no header, hand-edited)`,
    );
    expect(plan([TIERED], { [file]: "mine\n" }, true)).toContain(
      `update ${file} (overwritten with --force)`,
    );
  });

  it("refuses a command file someone wrote by hand too, and never overwrites it without --force", () => {
    const file = ".claude/commands/tiered.md";
    expect(plan([TIERED], { [file]: "my own /tiered\n" })).toContain(
      `conflict ${file} (no header, hand-edited)`,
    );
    // Not --force: the plan alone never carries an update or create for the file.
    expect(plan([TIERED], { [file]: "my own /tiered\n" })).not.toContain(`update ${file}`);
    expect(plan([TIERED], { [file]: "my own /tiered\n" }, true)).toContain(
      `update ${file} (overwritten with --force)`,
    );
  });
});

describe("readWorkflowExisting", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "agn-workflow-plan-"));
  });

  afterEach(() => rm(repo, { recursive: true, force: true }));

  it("reads every target of every workflow, null for the ones not there yet", async () => {
    await mkdir(join(repo, ".claude/agents"), { recursive: true });
    await writeFile(join(repo, ".claude/agents/developer.md"), "mine\n", "utf8");
    expect(await readWorkflowExisting(repo, [TIERED])).toEqual({
      ".claude/agents/developer.md": "mine\n",
      ".claude/commands/tiered.md": null,
    });
  });
});
