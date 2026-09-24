import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readWorkflow, readWorkflows, WorkflowSchema } from "./workflow.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/workflows", import.meta.url));

describe("readWorkflow", () => {
  it("reads the roles in the order the file writes them", async () => {
    const workflow = await readWorkflow(`${FIXTURES}/valid`, "tiered");
    expect(workflow?.name).toBe("tiered");
    expect(workflow?.description).toBe("Plan, implement, test and review, each by its own role.");
    expect(workflow?.roles.map((role) => [role.name, role.class])).toEqual([
      ["architect", "research"],
      ["developer", "implement"],
      ["test-writer", "implement"],
      ["reviewer", "review"],
    ]);
  });

  it("leaves an absent profile and absent instructions null", async () => {
    const workflow = await readWorkflow(`${FIXTURES}/valid`, "tiered");
    expect(workflow?.roles[0]?.profile).toBeNull();
    expect(workflow?.roles[1]?.profile).toBe("claude-code:sonnet-4.5:native");
    expect(workflow?.roles[3]?.instructions).toBeNull();
  });

  it("returns null when the repo has no file of that name", async () => {
    expect(await readWorkflow(`${FIXTURES}/valid`, "nope")).toBeNull();
  });

  it("names the role and the key that failed the schema", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "bad-class")).rejects.toMatchObject({
      name: "ConfigError",
      code: "ag-file-invalid",
      message: expect.stringContaining("roles.1.class"),
      file: `${FIXTURES}/invalid/.ag/workflows/bad-class.yaml`,
      hint: expect.stringContaining("agn workflow init"),
    });
  });

  it("refuses two roles with the same name", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "duplicate-role")).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("developer appears twice"),
    });
  });

  it("refuses a workflow with no roles", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "no-roles")).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("roles"),
    });
  });

  it("refuses a name in the file that is not the file's own name", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "name-mismatch")).rejects.toMatchObject({
      name: "ConfigError",
      code: "workflow-name-mismatch",
      message: expect.stringContaining("says name: something-else"),
      file: expect.stringContaining("name-mismatch.yaml"),
    });
  });

  it("refuses a top-level key it does not know", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "unknown-key")).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("stages"),
    });
  });

  it("refuses a role name with a capital or a space", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "bad-role-name")).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("roles.0.name"),
    });
  });

  it("refuses a profile that is not a whole profile id", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "bad-profile")).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("expected a profile id like claude-code:sonnet-4.5:native"),
    });
  });

  it("reports a file that is not yaml at all", async () => {
    await expect(readWorkflow(`${FIXTURES}/malformed`, "broken")).rejects.toMatchObject({
      name: "ConfigError",
      code: "ag-file-malformed",
      file: expect.stringContaining("broken.yaml"),
    });
  });

  it("refuses a file whose top level is a list, not a mapping", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "list-root")).rejects.toMatchObject({
      code: "ag-file-invalid",
      file: expect.stringContaining("list-root.yaml"),
    });
  });

  it("refuses a file whose top level is a bare scalar", async () => {
    await expect(readWorkflow(`${FIXTURES}/invalid`, "scalar-root")).rejects.toMatchObject({
      code: "ag-file-invalid",
      file: expect.stringContaining("scalar-root.yaml"),
    });
  });
});

describe("readWorkflows", () => {
  it("returns every .yaml in the folder, sorted by name", async () => {
    const workflows = await readWorkflows(`${FIXTURES}/valid`);
    expect(workflows.map((workflow) => workflow.name)).toEqual(["audit", "tiered"]);
  });

  it("returns nothing when the folder is missing", async () => {
    expect(await readWorkflows(`${FIXTURES}/none`)).toEqual([]);
  });

  it("returns nothing when the folder is there but empty", async () => {
    expect(await readWorkflows(`${FIXTURES}/empty-folder`)).toEqual([]);
  });

  it("throws on the first file it cannot use", async () => {
    await expect(readWorkflows(`${FIXTURES}/malformed`)).rejects.toMatchObject({
      code: "ag-file-malformed",
    });
  });

  it("throws the raw fs error when a name ending in .yaml is a directory, not a file", async () => {
    await expect(readWorkflows(`${FIXTURES}/dir-entry`)).rejects.toMatchObject({
      code: "EISDIR",
    });
  });
});

describe("WorkflowSchema", () => {
  it("refuses a role class that is not a task intent", () => {
    const parsed = WorkflowSchema.safeParse({
      name: "one",
      roles: [{ name: "dev", class: "deploy" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a key inside a role that it does not know", () => {
    const parsed = WorkflowSchema.safeParse({
      name: "one",
      roles: [{ name: "dev", class: "implement", model: "sonnet" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses empty instructions", () => {
    const parsed = WorkflowSchema.safeParse({
      name: "one",
      roles: [{ name: "dev", class: "implement", instructions: "" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an empty description", () => {
    const parsed = WorkflowSchema.safeParse({
      name: "one",
      description: "",
      roles: [{ name: "dev", class: "implement" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses roles given as a mapping instead of a list", () => {
    const parsed = WorkflowSchema.safeParse({
      name: "one",
      roles: { dev: { name: "dev", class: "implement" } },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a 64-character role name and refuses a 65th character", () => {
    const sixtyFour = `a${"b".repeat(63)}`;
    expect(sixtyFour).toHaveLength(64);
    const legal = WorkflowSchema.safeParse({
      name: "one",
      roles: [{ name: sixtyFour, class: "implement" }],
    });
    expect(legal.success).toBe(true);

    const sixtyFive = `${sixtyFour}c`;
    const illegal = WorkflowSchema.safeParse({
      name: "one",
      roles: [{ name: sixtyFive, class: "implement" }],
    });
    expect(illegal.success).toBe(false);
  });

  it("accepts a name that ends in a dash: the regex has no rule against it", () => {
    const parsed = WorkflowSchema.safeParse({
      name: "audit-",
      roles: [{ name: "dev", class: "implement" }],
    });
    expect(parsed.success).toBe(true);
  });
});
