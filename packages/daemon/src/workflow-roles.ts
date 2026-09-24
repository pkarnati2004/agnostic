import {
  type Profile,
  parseProfileId,
  type Repo,
  type RoleResolution,
  type Workflow,
  type WorkflowRole,
} from "@agnostic/core";
import { recommend } from "@agnostic/recommender";
import type { ResolvedRole, ResolvedWorkflow } from "@agnostic/sync";
import type { DaemonContext } from "./app.js";
import { buildRecommendInput } from "./recommend-input.js";

/**
 * The profile every role of every workflow compiles to: the pin when this machine can run it, and
 * the recommender's pick for the role's class otherwise (ADR 036 Q12). A sync is not a decision
 * about a task, so nothing here is recorded in the ledger; the run that follows records its own.
 */
export async function resolveWorkflowRoles(
  ctx: DaemonContext,
  repo: Repo,
  workflows: Workflow[],
): Promise<{ resolved: ResolvedWorkflow[]; roles: RoleResolution[] }> {
  const profiles = (await ctx.detection.current()).profiles;
  const resolved: ResolvedWorkflow[] = [];
  const roles: RoleResolution[] = [];
  for (const workflow of workflows) {
    const rows: ResolvedRole[] = [];
    for (const role of workflow.roles) {
      const resolution = await resolveRole(ctx, repo, workflow, role, profiles);
      roles.push(resolution);
      // `role.profile` is the pin, which the resolved profile replaces whether it was used or not.
      rows.push({ ...role, profile: resolution.profile, ...parsed(resolution.profile) });
    }
    resolved.push({ name: workflow.name, description: workflow.description, roles: rows });
  }
  return { resolved, roles };
}

async function resolveRole(
  ctx: DaemonContext,
  repo: Repo,
  workflow: Workflow,
  role: WorkflowRole,
  profiles: Profile[],
): Promise<RoleResolution> {
  const row = { workflow: workflow.name, role: role.name, class: role.class, pinned: role.profile };
  const unusable = role.profile === null ? null : whyUnusable(role.profile, profiles);
  if (role.profile !== null && unusable === null) {
    return { ...row, ...parsed(role.profile), profile: role.profile, via: "pinned", reason: null };
  }
  const picked = await recommendForRole(ctx, repo, workflow, role);
  return {
    ...row,
    ...parsed(picked),
    profile: picked,
    via: unusable === null ? "recommended" : "replaced",
    reason: unusable,
  };
}

/** Availability, not budget: a profile over its ceiling is refused at run time (ADR 036 Q9). */
function whyUnusable(pinned: string, profiles: Profile[]): string | null {
  const profile = profiles.find((candidate) => candidate.id === pinned);
  if (profile === undefined) {
    return `${pinned} is not a profile on this machine`;
  }
  return profile.available ? null : `${pinned} is not available (not logged in, or no key)`;
}

/** The role's own instructions are the prompt, so the classifier reads what the role will be told. */
async function recommendForRole(
  ctx: DaemonContext,
  repo: Repo,
  workflow: Workflow,
  role: WorkflowRole,
): Promise<string> {
  const prompt = role.instructions ?? `${role.name} role of the ${workflow.name} workflow`;
  const input = await buildRecommendInput(ctx, repo, prompt, { intent: role.class });
  return recommend(input).recommended.profileId;
}

function parsed(profileId: string): { harness: ResolvedRole["harness"]; model: string | null } {
  const { harness, model } = parseProfileId(profileId);
  return { harness, model };
}
