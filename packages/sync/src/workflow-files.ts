import type { HarnessId, WorkflowRole } from "@agnostic/core";
import { generatedHeader, withoutTrailingNewlines } from "./generated-header.js";

/** The one harness whose subagent and command files agn writes in this cut (ADR 036 Q13). */
export const AGENT_HARNESS = "claude-code";

/** A role with the profile this sync resolved it to, pin or recommendation. */
export type ResolvedRole = WorkflowRole & {
  profile: string;
  harness: HarnessId;
  model: string | null;
};

export type ResolvedWorkflow = { name: string; description: string | null; roles: ResolvedRole[] };

/** A profile with no model segment: the role runs on whatever model the session is already on. */
const INHERIT = "inherit";

/** One Claude Code subagent, named for the role, carrying that role's instructions and no others. */
export function agentFile(
  workflow: ResolvedWorkflow,
  role: ResolvedRole,
): { file: string; content: string } {
  const frontMatter = [
    `name: ${frontMatterValue(role.name)}`,
    `description: ${frontMatterValue(roleDescription(workflow, role))}`,
    `model: ${frontMatterValue(role.model ?? INHERIT)}`,
  ];
  return {
    file: `.claude/agents/${role.name}.md`,
    content: render(workflow.name, frontMatter, roleBody(workflow, role)),
  };
}

/** The workflow as a slash command: the roles in order, each a step the harness runs itself. */
export function commandFile(workflow: ResolvedWorkflow): { file: string; content: string } {
  const frontMatter = [
    `description: ${frontMatterValue(workflowDescription(workflow))}`,
    "argument-hint: <task>",
  ];
  const body = [
    `Run the ${workflow.name} workflow for: $ARGUMENTS`,
    "",
    "Do the steps in order. Do no step's work yourself. Give each step the task and the reports of the steps before it.",
    "",
    ...workflow.roles.flatMap((role, index) => step(role, index + 1)),
    "",
    "When the last step is done, report each step's result in one line, then the last report in full.",
  ];
  return {
    file: `.claude/commands/${workflow.name}.md`,
    content: render(workflow.name, frontMatter, body.join("\n")),
  };
}

/** Bare where yaml reads it back as the same string, quoted where a colon or a comment would not. */
export function frontMatterValue(text: string): string {
  const bare = /^[A-Za-z0-9][A-Za-z0-9 .,()'_/-]*$/.test(text) && !text.endsWith(" ");
  return bare ? text : JSON.stringify(text);
}

/** Front matter first: Claude Code's parser wants `---` on line 1, so the header follows it. */
function render(workflow: string, frontMatter: string[], body: string): string {
  const header = generatedHeader(`.ag/workflows/${workflow}.yaml`);
  return `---\n${frontMatter.join("\n")}\n---\n${header}\n\n${withoutTrailingNewlines(body)}\n`;
}

function roleDescription(workflow: ResolvedWorkflow, role: ResolvedRole): string {
  return `The ${role.name} role of the ${workflow.name} workflow (${role.class}).`;
}

function roleBody(workflow: ResolvedWorkflow, role: ResolvedRole): string {
  return role.instructions ?? `Do the ${role.name} step of the ${workflow.name} workflow.`;
}

function workflowDescription(workflow: ResolvedWorkflow): string {
  const roles = workflow.roles.map((role) => role.name).join(", ");
  return workflow.description ?? `Run the ${workflow.name} workflow: ${roles}.`;
}

/**
 * A role on Claude Code is a subagent this session can call. A role on any other agent is a
 * handoff: agn ends this session and the next agent continues from the note (ADR 036 Q13).
 */
function step(role: ResolvedRole, number: number): string[] {
  if (role.harness === AGENT_HARNESS) {
    return [`${number}. ${role.name} (${role.profile}): use the ${role.name} subagent.`];
  }
  const carries =
    role.instructions === null
      ? "what the steps above did and the steps that remain"
      : `the ${role.name} instructions below, what the steps above did, and the steps that remain`;
  const line =
    `${number}. ${role.name} (${role.profile}, another agent): run \`agn handoff --to ${role.profile}\`` +
    ` (or the agn_handoff MCP tool) with a note that carries ${carries}.` +
    " The handoff ends this session; the next agent continues from the note.";
  return role.instructions === null ? [line] : [line, ...instructionsBlock(role)];
}

/** The instructions the next agent is told, indented under the step that hands off to it. */
function instructionsBlock(role: ResolvedRole): string[] {
  const lines = withoutTrailingNewlines(role.instructions ?? "").split("\n");
  return [
    `   ${capitalize(role.name)} instructions:`,
    ...lines.map((line) => (line === "" ? "" : `     ${line}`)),
  ];
}

function capitalize(name: string): string {
  return `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
}
