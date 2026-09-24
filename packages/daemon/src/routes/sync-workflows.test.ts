import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agPaths, type Profile, type Repo, type SyncResponse } from "@agnostic/core";
import { generatedHeader } from "@agnostic/sync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Detection } from "../detection-cache.js";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection } from "../test-detection.js";

// The plain CLAUDE.md/AGENTS.md half of this route lives in sync.test.ts, which shares this
// file's shape (post, repoWithClaudeMd, read, sync) but not its module, to stay under the file cap.
const INSTRUCTIONS = "# app\n\nRun `pnpm test` before you finish.\n";

const TIERED = `name: tiered
description: Plan, implement, test and review, each by its own role.
roles:
  - name: architect
    class: research
    instructions: |
      Turn the task into a short plan.
  - name: developer
    class: implement
  - name: test-writer
    class: implement
  - name: reviewer
    class: review
`;

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon();
});

afterEach(() => daemon.close());

async function post(path: string, body?: unknown): Promise<Response> {
  return daemon.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function repoWithClaudeMd(): Promise<Repo> {
  const repo = await daemon.addRepo();
  await writeFile(join(repo.path, "CLAUDE.md"), INSTRUCTIONS, "utf8");
  return repo;
}

function read(repo: Repo, file: string): Promise<string> {
  return readFile(join(repo.path, file), "utf8");
}

async function sync(repo: Repo, body?: unknown): Promise<SyncResponse> {
  const response = await post(`/repos/${repo.id}/sync`, body);
  expect(response.status).toBe(200);
  return (await response.json()) as SyncResponse;
}

/** One profile the machine knows about and cannot use: logged out, or its key is gone. */
function withUnavailable(id: string, detection: Detection): Detection {
  const profiles: Profile[] = detection.profiles.map((profile) =>
    profile.id === id ? { ...profile, available: false } : profile,
  );
  return { ...detection, profiles };
}

/** A repo `agn init` has run in, with one workflow file under `.ag/workflows/`. */
async function repoWithWorkflow(files: Record<string, string> = { tiered: TIERED }): Promise<Repo> {
  const repo = await repoWithClaudeMd();
  await post(`/repos/${repo.id}/init`);
  await mkdir(agPaths(repo.path).workflowsDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(agPaths(repo.path).workflowsDir, `${name}.yaml`), text, "utf8");
  }
  return repo;
}

describe("POST /repos/:id/sync with workflows", () => {
  it("compiles every role into an agent file and the workflow into a command", async () => {
    const repo = await repoWithWorkflow();
    const body = await sync(repo);
    expect(body.writes.map((write) => write.file)).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/agents/architect.md",
      ".claude/agents/developer.md",
      ".claude/agents/test-writer.md",
      ".claude/agents/reviewer.md",
      ".claude/commands/tiered.md",
    ]);
    expect(body.roles.map((row) => `${row.role} ${row.via}`)).toEqual([
      "architect recommended",
      "developer recommended",
      "test-writer recommended",
      "reviewer recommended",
    ]);
    const agent = await read(repo, ".claude/agents/architect.md");
    expect(agent.split("\n")[0]).toBe("---");
    // Front matter first, so Claude Code parses it; the header is the first body line.
    expect(agent.split("\n")[5]).toBe(generatedHeader(".ag/workflows/tiered.yaml"));
    // The test daemon's fixture detection recommends the default profile, which has no model
    // segment, so the agent runs on whatever model the session is already on.
    expect(agent).toContain("\nmodel: inherit\n");
    expect(await read(repo, ".claude/commands/tiered.md")).toContain(
      "1. architect (claude-code:default:native): use the architect subagent.",
    );
  });

  it("records no recommendation.made event: a sync decides nothing about a task", async () => {
    const repo = await repoWithWorkflow();
    await sync(repo);
    const kinds = daemon.ledger.events.after(0).map((event) => event.kind);
    expect(kinds).not.toContain("recommendation.made");
  });

  it("reports every file unchanged on a second sync", async () => {
    const repo = await repoWithWorkflow();
    await sync(repo);
    const again = await sync(repo);
    expect(again.writes.map((write) => write.action)).toEqual(Array(7).fill("unchanged"));
  });

  it("writes nothing on a dry run and answers with the same roles", async () => {
    const repo = await repoWithWorkflow();
    const body = await sync(repo, { dryRun: true });
    expect(body.applied).toBe(false);
    expect(body.roles).toHaveLength(4);
    await expect(read(repo, ".claude/commands/tiered.md")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses the whole plan when one agent file was written by hand", async () => {
    const repo = await repoWithWorkflow();
    await mkdir(join(repo.path, ".claude/agents"), { recursive: true });
    await writeFile(join(repo.path, ".claude/agents/developer.md"), "mine\n", "utf8");
    const refused = await post(`/repos/${repo.id}/sync`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: { code: "sync-conflict", message: expect.stringContaining("agents/developer.md") },
    });
    // All or nothing: the instruction files are still the ones `agn init` left behind.
    expect(await read(repo, "CLAUDE.md")).toBe(INSTRUCTIONS);
    expect((await sync(repo, { force: true })).applied).toBe(true);
    expect(await read(repo, ".claude/agents/developer.md")).toContain("name: developer");
  });

  it("names a workflow file it cannot parse", async () => {
    const repo = await repoWithWorkflow({ tiered: "name: tiered\nroles:\n  - name: x\n" });
    const response = await post(`/repos/${repo.id}/sync`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "ag-file-invalid", message: expect.stringContaining("tiered.yaml") },
    });
  });

  it("refuses a workflow whose name is not its file's name", async () => {
    const repo = await repoWithWorkflow({
      tiered: "name: other\nroles:\n  - name: reviewer\n    class: review\n",
    });
    const response = await post(`/repos/${repo.id}/sync`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "workflow-name-mismatch", message: expect.stringContaining("tiered.yaml") },
    });
  });

  it("refuses two workflows that declare the same role", async () => {
    const repo = await repoWithWorkflow({
      tiered: TIERED,
      audit: "name: audit\nroles:\n  - name: reviewer\n    class: review\n",
    });
    const response = await post(`/repos/${repo.id}/sync`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "workflow-role-collision" } });
  });

  it("refuses a hand-edited command file and never overwrites it without --force", async () => {
    const repo = await repoWithWorkflow();
    await sync(repo);
    const mine = "my own /tiered\n";
    await writeFile(join(repo.path, ".claude/commands/tiered.md"), mine, "utf8");
    const refused = await post(`/repos/${repo.id}/sync`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: {
        code: "sync-conflict",
        message: expect.stringContaining("commands/tiered.md"),
        hint: expect.stringContaining("--force"),
      },
    });
    expect(await read(repo, ".claude/commands/tiered.md")).toBe(mine);
    expect((await sync(repo, { force: true })).applied).toBe(true);
    expect(await read(repo, ".claude/commands/tiered.md")).not.toBe(mine);
  });

  it("writes through .claude when it is a symlink to a directory elsewhere", async () => {
    const repo = await repoWithWorkflow();
    const target = await mkdtemp(join(tmpdir(), "agn-claude-target-"));
    await symlink(target, join(repo.path, ".claude"));
    await sync(repo);
    expect(await readFile(join(target, "agents", "architect.md"), "utf8")).toContain(
      "name: architect",
    );
    expect(await readFile(join(target, "commands", "tiered.md"), "utf8")).toContain(
      "Run the tiered workflow",
    );
  });

  it("replaces a pin this machine cannot run and reports why in SyncResponse.roles", async () => {
    const pin = "claude-code:sonnet-4.5:native";
    await daemon.close();
    daemon = await createTestDaemon({
      detect: () => Promise.resolve(withUnavailable(pin, fixtureDetection())),
    });
    const single = `name: single\nroles:\n  - name: developer\n    class: implement\n    profile: ${pin}\n`;
    const repo = await repoWithWorkflow({ single });
    const body = await sync(repo);
    expect(body.roles).toEqual([
      expect.objectContaining({
        workflow: "single",
        role: "developer",
        pinned: pin,
        via: "replaced",
        reason: `${pin} is not available (not logged in, or no key)`,
      }),
    ]);
  });

  it("compiles the workflows of a repo that has no instructions.md", async () => {
    const repo = await repoWithWorkflow();
    await rm(agPaths(repo.path).instructionsMd);
    const body = await sync(repo);
    expect(body.writes.map((write) => write.file)).toEqual([
      ".claude/agents/architect.md",
      ".claude/agents/developer.md",
      ".claude/agents/test-writer.md",
      ".claude/agents/reviewer.md",
      ".claude/commands/tiered.md",
    ]);
    expect(body.roles).toHaveLength(4);
  });

  it("has no roles to report in a repo with no .ag/workflows/", async () => {
    const repo = await repoWithClaudeMd();
    await post(`/repos/${repo.id}/init`);
    const body = await sync(repo);
    expect(body.writes.map((write) => write.file)).toEqual(["CLAUDE.md", "AGENTS.md"]);
    expect(body.roles).toEqual([]);
  });
});
