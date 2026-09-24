export type TemplateId = "none" | "single" | "tiered";

export const TEMPLATE_IDS: TemplateId[] = ["none", "single", "tiered"];

const NAME = "<name>";

const SINGLE = `# One agent does the whole task. \`agn sync\` compiles this file into Claude Code's
# .claude/agents/ and .claude/commands/; edit here and run \`agn sync\` again.
name: ${NAME}
description: One developer role that implements, tests and reports.
roles:
  - name: developer
    class: implement
    # profile: claude-code:sonnet:native   # pin one; absent, agn picks per class at sync time
    instructions: |
      Implement exactly what the task asks. Run the repo's tests before you finish.
      Report what you changed, what you did not do, and any risk you see.
`;

const TIERED = `# Plan, implement, test and review, each by its own role. \`agn sync\` compiles this file into
# Claude Code's .claude/agents/ and .claude/commands/; edit here and run \`agn sync\` again.
name: ${NAME}
description: Plan, implement, test and review, each by its own role.
roles:
  - name: architect
    class: research
    instructions: |
      Turn the task into a short plan: goal, files, signatures, acceptance criteria, out of scope.
      Write no code. Stop and ask when a choice changes an interface, a schema or a dependency.
  - name: developer
    class: implement
    instructions: |
      Implement the architect's plan. Run and test as you go. Report the files touched,
      deviations from the plan and why, and risks for review. No pasted logs.
  - name: test-writer
    class: implement
    instructions: |
      Write unit tests for the developer's change: one per acceptance criterion in the plan,
      plus one for each bug you find. Change no production code; report gaps instead.
  - name: reviewer
    class: review
    # Pin a profile on another harness than the developer's, so the review is independent:
    # profile: codex:default:native
    instructions: |
      Review the diff against the plan: correctness, size, naming, tests that exercise the
      change. Report findings with file and line. Change nothing.
`;

/**
 * Literal text rather than `stringify` output: the commented `profile:` lines are half of what a
 * template teaches, and a yaml writer would drop every comment in the file.
 */
export function workflowTemplate(template: Exclude<TemplateId, "none">, name: string): string {
  return (template === "single" ? SINGLE : TIERED).replace(NAME, name);
}
