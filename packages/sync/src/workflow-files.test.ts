import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProfileId, readWorkflow, type WorkflowRole } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  agentFile,
  commandFile,
  frontMatterValue,
  type ResolvedRole,
  type ResolvedWorkflow,
} from "./workflow-files.js";

const FIXTURE = fileURLToPath(
  new URL("../../../tests/fixtures/workflows/tiered-resolved/", import.meta.url),
);

/** What the tech lead's machine resolved the four roles to, with the reviewer on another agent. */
const PROFILES: Record<string, string> = {
  architect: "claude-code:fable:native",
  developer: "claude-code:opus:native",
  "test-writer": "claude-code:sonnet:native",
  reviewer: "codex:default:native",
};

let tiered: ResolvedWorkflow;

function resolved(role: WorkflowRole): ResolvedRole {
  const profileId = PROFILES[role.name];
  if (profileId === undefined) {
    throw new Error(`the fixture grew a role the test has no profile for: ${role.name}`);
  }
  const { harness, model } = parseProfileId(profileId);
  return { ...role, profile: profileId, harness, model };
}

beforeAll(async () => {
  const workflow = await readWorkflow(FIXTURE, "tiered");
  if (workflow === null) {
    throw new Error(`${FIXTURE} has no tiered.yaml`);
  }
  tiered = { ...workflow, roles: workflow.roles.map(resolved) };
});

function fixtureFile(file: string): Promise<string> {
  return readFile(join(FIXTURE, file), "utf8");
}

function role(name: string): ResolvedRole {
  const found = tiered.roles.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`no ${name} role in the fixture`);
  }
  return found;
}

describe("agentFile", () => {
  it.each(["architect", "developer", "test-writer"])("writes %s byte for byte", async (name) => {
    const { file, content } = agentFile(tiered, role(name));
    expect(file).toBe(`.claude/agents/${name}.md`);
    expect(content).toBe(await fixtureFile(file));
  });

  it("inherits the session's model for a profile with no model segment", () => {
    const { content } = agentFile(tiered, { ...role("developer"), model: null });
    expect(content).toContain("\nmodel: inherit\n");
  });

  it("tells a role with no instructions what step it is", () => {
    const { content } = agentFile(tiered, { ...role("developer"), instructions: null });
    expect(content).toContain("\n\nDo the developer step of the tiered workflow.\n");
  });

  it("collapses instructions with several trailing newlines to exactly one", () => {
    const { content } = agentFile(tiered, {
      ...role("developer"),
      instructions: "Implement the architect's plan.\n\n\n",
    });
    expect(content.endsWith("Implement the architect's plan.\n")).toBe(true);
    expect(content.endsWith("Implement the architect's plan.\n\n")).toBe(false);
  });
});

describe("commandFile", () => {
  it("writes the workflow's steps byte for byte", async () => {
    const { file, content } = commandFile(tiered);
    expect(file).toBe(".claude/commands/tiered.md");
    expect(content).toBe(await fixtureFile(file));
  });

  it("names the roles when the workflow has no description", () => {
    const { content } = commandFile({ ...tiered, description: null });
    // The fallback carries a colon, which yaml would read as a key, so it is quoted.
    expect(content).toContain(
      'description: "Run the tiered workflow: architect, developer, test-writer, reviewer."',
    );
  });

  it("leaves out the instructions block of a handoff step for a role with none", () => {
    const reviewer = { ...role("reviewer"), instructions: null };
    const { content } = commandFile({ ...tiered, roles: [reviewer] });
    expect(content).toContain(
      "1. reviewer (codex:default:native, another agent): run `agn handoff --to codex:default:native`",
    );
    expect(content).not.toContain("Reviewer instructions:");
  });
});

describe("frontMatterValue", () => {
  it("leaves a plain sentence bare", () => {
    expect(frontMatterValue("The architect role of the tiered workflow (research).")).toBe(
      "The architect role of the tiered workflow (research).",
    );
  });

  it.each(["Plan: then build", "two  words ", "#1 role", "- dash", "Über"])(
    "quotes %j, which yaml would read back as something else",
    (text) => {
      expect(frontMatterValue(text)).toBe(JSON.stringify(text));
    },
  );
});
