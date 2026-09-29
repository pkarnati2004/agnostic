import { join } from "node:path";
import { readTextFile, type SyncWrite } from "@agnostic/core";
import { SyncError } from "./error.js";
import type { PlannedTarget } from "./sync-plan.js";
import { planWrites } from "./sync-plan.js";
import { AGENT_HARNESS, agentFile, commandFile, type ResolvedWorkflow } from "./workflow-files.js";

export type WorkflowSyncInputs = {
  workflows: ResolvedWorkflow[];
  existing: Record<string, string | null>;
};

/** Every generated file of every workflow, in workflow order, the agents before the command. */
export function planWorkflowSync(
  inputs: WorkflowSyncInputs,
  opts: { force: boolean },
): SyncWrite[] {
  return planWrites(workflowTargets(inputs.workflows), inputs.existing, opts);
}

export async function readWorkflowExisting(
  repoPath: string,
  workflows: ResolvedWorkflow[],
): Promise<Record<string, string | null>> {
  const existing: Record<string, string | null> = {};
  for (const target of workflowTargets(workflows)) {
    existing[target.file] = await readTextFile(join(repoPath, target.file));
  }
  return existing;
}

function workflowTargets(workflows: ResolvedWorkflow[]): PlannedTarget[] {
  assertRolesUnique(workflows);
  return workflows.flatMap((workflow) => [
    ...workflow.roles
      .filter((role) => role.harness === AGENT_HARNESS)
      .map((role) => agentFile(workflow, role)),
    commandFile(workflow),
  ]);
}

/**
 * Refused whatever harness each role resolved to, so a repo that syncs today does not fail
 * tomorrow when a recommendation moves one of the two roles onto Claude Code.
 */
function assertRolesUnique(workflows: ResolvedWorkflow[]): void {
  const owner = new Map<string, string>();
  for (const workflow of workflows) {
    for (const role of workflow.roles) {
      const first = owner.get(role.name);
      if (first !== undefined) {
        throw roleCollision(role.name, first, workflow.name);
      }
      owner.set(role.name, workflow.name);
    }
  }
}

function roleCollision(role: string, first: string, second: string): SyncError {
  return new SyncError(
    `role ${role} is declared in workflows ${first} and ${second}, and Claude Code has one .claude/agents/${role}.md`,
    { code: "workflow-role-collision", hint: "Rename one of them." },
  );
}
