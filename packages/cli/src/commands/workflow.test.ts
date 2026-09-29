import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agPaths, type RepoListRow, workflowPath } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { workflowCommand } from "./workflow.js";

const REPO_ID = "r7k2m4pqrs";

let repo: string;

beforeEach(async () => {
  repo = await realpath(await mkdtemp(join(tmpdir(), "agn-workflow-")));
  await mkdir(agPaths(repo).dir, { recursive: true });
});

afterEach(() => rm(repo, { recursive: true, force: true }));

function row(): RepoListRow {
  return {
    id: REPO_ID,
    path: repo,
    kind: "git",
    name: "app",
    addedAt: "2026-09-23T10:00:00.000Z",
    status: "active",
    testCommand: null,
    pathPresent: true,
  };
}

async function run(argv: string[], opts: { json?: boolean } = {}) {
  const test = createTestContext({
    cwd: repo,
    client: { listRepos: () => Promise.resolve({ repos: [row()], cursor: 0 }) },
  });
  test.ctx.json = opts.json === true;
  await workflowCommand(test.ctx).parseAsync(argv, { from: "user" });
  return test;
}

function fails(argv: string[]): Promise<{ code: string; message: string }> {
  return run(argv).then(
    () => {
      throw new Error(`agn workflow ${argv.join(" ")} was supposed to fail`);
    },
    (cause: { code: string; message: string }) => cause,
  );
}

describe("agn workflow init", () => {
  it("writes the tiered template and names the pipeline", async () => {
    const { out } = await run(["init"]);
    expect(out).toEqual([
      "wrote .ag/workflows/tiered.yaml",
      "roles: architect (research) > developer (implement) > test-writer (implement) > reviewer (review)",
    ]);
    expect(await readFile(workflowPath(repo, "tiered"), "utf8")).toContain("name: tiered");
  });

  it("names the file after --name and writes the template --template asks for", async () => {
    const { out } = await run(["init", "--template", "single", "--name", "dev"]);
    expect(out).toEqual(["wrote .ag/workflows/dev.yaml", "roles: developer (implement)"]);
    expect(await readFile(workflowPath(repo, "dev"), "utf8")).toContain("name: dev\n");
  });

  it("refuses to overwrite a workflow that is already there", async () => {
    await run(["init"]);
    const error = await fails(["init"]);
    expect(error.code).toBe("workflow-exists");
    expect(error.message).toBe(".ag/workflows/tiered.yaml exists");
  });

  it("overwrites with --force", async () => {
    await run(["init", "--template", "single", "--name", "tiered"]);
    await run(["init", "--force"]);
    expect(await readFile(workflowPath(repo, "tiered"), "utf8")).toContain("name: architect");
  });

  it("writes nothing for --template none", async () => {
    const { out } = await run(["init", "--template", "none"]);
    expect(out).toEqual(["nothing written: a repo without .ag/workflows/ runs tasks as before"]);
    await expect(readFile(agPaths(repo).workflowsDir)).rejects.toThrow();
  });

  it("asks for agn init when the repo has no .ag/", async () => {
    await rm(agPaths(repo).dir, { recursive: true });
    const error = await fails(["init"]);
    expect(error.code).toBe("ag-missing");
    expect(error.message).toBe(`${repo} has no .ag/ folder`);
  });

  it("refuses a name that is not a legal file and command name", async () => {
    expect((await fails(["init", "--name", "../escape"])).code).toBe("workflow-name-invalid");
    expect((await fails(["init", "--name", "Tiered"])).code).toBe("workflow-name-invalid");
  });

  it("prints the workflow it wrote with --json", async () => {
    const { out } = await run(["init", "--template", "single", "--name", "dev"], { json: true });
    const workflow = JSON.parse(out.join("\n")) as { name: string; roles: { name: string }[] };
    expect(workflow.name).toBe("dev");
    expect(workflow.roles.map((role) => role.name)).toEqual(["developer"]);
  });

  it.skipIf(process.getuid?.() === 0)(
    "names the file when --force cannot write over a read-only one",
    async () => {
      await run(["init"]);
      await chmod(workflowPath(repo, "tiered"), 0o400);
      const error = await fails(["init", "--force"]);
      expect(error.code).toBe("workflow-write-refused");
      expect(error.message).toContain(".ag/workflows/tiered.yaml");
    },
  );

  it("says so when .ag/workflows is a file, not a folder", async () => {
    await rm(agPaths(repo).workflowsDir, { recursive: true, force: true });
    await writeFile(agPaths(repo).workflowsDir, "not a folder\n", "utf8");
    const error = await fails(["init"]);
    expect(error.code).toBe("workflow-dir-not-directory");
    expect(error.message).toContain(".ag/workflows");
  });
});

describe("agn workflow list", () => {
  it("points at init when the repo declares none", async () => {
    const { out } = await run(["list"]);
    expect(out).toEqual(["no workflows; run agn workflow init"]);
  });

  it("lists every workflow, sorted by name", async () => {
    await run(["init"]);
    await run(["init", "--template", "single", "--name", "dev"]);
    const { out } = await run(["list"]);
    expect(out[0]).toMatch(/^name\s+roles\s+description$/);
    expect(out[1]).toMatch(/^dev\s+developer\s+One developer role/);
    expect(out[2]).toMatch(/^tiered\s+architect > developer > test-writer > reviewer\s+Plan,/);
  });

  it("reports a file in the folder that does not parse", async () => {
    await mkdir(agPaths(repo).workflowsDir, { recursive: true });
    await writeFile(
      workflowPath(repo, "broken"),
      "name: broken\nroles:\n  - name: x\n    class: nope\n",
      "utf8",
    );
    const error = await fails(["list"]);
    expect(error.code).toBe("ag-file-invalid");
    expect(error.message).toContain("roles.0.class");
    expect(error.message).toContain("broken.yaml");
  });

  it("prints the list with --json", async () => {
    await run(["init"]);
    const { out } = await run(["list"], { json: true });
    const body = JSON.parse(out.join("\n")) as { workflows: { name: string }[] };
    expect(body.workflows.map((workflow) => workflow.name)).toEqual(["tiered"]);
  });

  it("prints an empty array with --json when .ag/workflows/ was never created", async () => {
    const { out } = await run(["list"], { json: true });
    expect(JSON.parse(out.join("\n"))).toEqual({ workflows: [] });
  });
});

describe("agn workflow show", () => {
  it("prints the fields, then one numbered block per role", async () => {
    await run(["init"]);
    const { out } = await run(["show", "tiered"]);
    expect(out.slice(0, 3)).toEqual([
      "name:        tiered",
      "description: Plan, implement, test and review, each by its own role.",
      "file:        .ag/workflows/tiered.yaml",
    ]);
    expect(out[3]).toBe("");
    expect(out[4]).toBe("1. architect  research  agn picks at sync");
    expect(out[5]).toBe(
      "  Turn the task into a short plan: goal, files, signatures, acceptance criteria, out of scope.",
    );
    expect(out).toContain("4. reviewer  review  agn picks at sync");
  });

  it("shows a pinned profile instead of the placeholder", async () => {
    await mkdir(agPaths(repo).workflowsDir, { recursive: true });
    await writeFile(
      workflowPath(repo, "audit"),
      "name: audit\nroles:\n  - name: reviewer\n    class: review\n    profile: codex:gpt-5:native\n",
      "utf8",
    );
    const { out } = await run(["show", "audit"]);
    expect(out).toContain("1. reviewer  review  codex:gpt-5:native");
    expect(out).toContain("  -");
  });

  it("says so when there is no workflow of that name", async () => {
    const error = await fails(["show", "nope"]);
    expect(error.code).toBe("workflow-not-found");
    expect(error.message).toBe("no workflow named nope");
  });

  it("prints the workflow with --json", async () => {
    await run(["init", "--template", "single", "--name", "dev"]);
    const { out } = await run(["show", "dev"], { json: true });
    const workflow = JSON.parse(out.join("\n")) as { name: string };
    expect(workflow.name).toBe("dev");
  });

  it("carries a pinned profile and a null instructions field through --json", async () => {
    await mkdir(agPaths(repo).workflowsDir, { recursive: true });
    await writeFile(
      workflowPath(repo, "audit"),
      "name: audit\nroles:\n  - name: reviewer\n    class: review\n    profile: codex:gpt-5:native\n",
      "utf8",
    );
    const { out } = await run(["show", "audit"], { json: true });
    const workflow = JSON.parse(out.join("\n")) as {
      roles: { profile: string | null; instructions: string | null }[];
    };
    expect(workflow.roles[0]).toMatchObject({
      profile: "codex:gpt-5:native",
      instructions: null,
    });
  });
});

describe("--repo", () => {
  it("acts on the registered checkout the flag names, whatever the cwd is", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "agn-workflow-cwd-"));
    const test = createTestContext({
      cwd: elsewhere,
      client: { listRepos: () => Promise.resolve({ repos: [row()], cursor: 0 }) },
    });
    await workflowCommand(test.ctx).parseAsync(["init", "--repo", REPO_ID], { from: "user" });
    expect(test.out[0]).toBe("wrote .ag/workflows/tiered.yaml");
    expect(await readFile(workflowPath(repo, "tiered"), "utf8")).toContain("name: tiered");
    await rm(elsewhere, { recursive: true, force: true });
  });
});
