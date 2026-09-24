import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DesignOpenedResponse,
  type DesignOpenResponse,
  newId,
  type Repo,
  type Task,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;
let repo: Repo;
let dir = "";

const CLAUDE_DESIGN = {
  id: "claude-design",
  name: "Claude Design",
  via: "url",
  path: "https://claude.ai/design",
};

/** A fake `open` first on the daemon's PATH, standing in for the system opener. */
async function fakeOpen(script: string): Promise<string> {
  const bin = join(dir, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "open"), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return bin;
}

async function boot(pathPrefix?: string): Promise<void> {
  await daemon?.close();
  daemon = await createTestDaemon(pathPrefix === undefined ? {} : { pathPrefix });
  repo = await daemon.addRepo();
}

function seed(profileId: string): Task {
  const now = new Date().toISOString();
  return daemon.ledger.tasks.insert({
    id: newId(),
    repoId: repo.id,
    title: "wireframe the onboarding",
    prompt: "wireframe the onboarding",
    profileId,
    worktreePath: dir,
    branch: "agn/wireframe",
    baseCommit: null,
    compareId: null,
    status: "waiting",
    origin: "agn",
    createdAt: now,
    updatedAt: now,
  });
}

function failure(response: Response): Promise<{ code: string; hint?: string }> {
  return response.json().then((body) => (body as { error: { code: string; hint?: string } }).error);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agn-design-"));
  daemon = await createTestDaemon();
  repo = await daemon.addRepo();
});

afterEach(async () => {
  await daemon.close();
  await rm(dir, { recursive: true, force: true });
});

describe("GET /tasks/:id/design", () => {
  it("names the tool, the design folder and the command that opens it", async () => {
    const task = seed("other:claude-design:default:native");
    const response = await daemon.request(`/tasks/${task.id}/design`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as DesignOpenResponse;
    expect(body.tool).toEqual(CLAUDE_DESIGN);
    expect(body.folder).toBe(join(dir, "design"));
    expect(body.argv).toEqual(["open", "https://claude.ai/design"]);
  });

  it("refuses a task an agent ran", async () => {
    const task = seed("claude-code:default:native");
    const response = await daemon.request(`/tasks/${task.id}/design`);
    expect(response.status).toBe(400);
    expect((await failure(response)).code).toBe("not-a-design-task");
  });

  it("refuses a tool this machine cannot open", async () => {
    await daemon.close();
    daemon = await createTestDaemon({ designTools: [] });
    repo = await daemon.addRepo();
    const task = seed("other:figma:default:native");
    const response = await daemon.request(`/tasks/${task.id}/design`);
    expect(response.status).toBe(400);
    expect((await failure(response)).code).toBe("design-tool-not-found");
  });
});

describe("POST /tasks/:id/design/open", () => {
  it("opens the tool itself and says what it opened", async () => {
    const log = join(dir, "open.log");
    await boot(await fakeOpen(`echo "$@" >> ${log}`));
    const task = seed("other:claude-design:default:native");

    const response = await daemon.request(`/tasks/${task.id}/design/open`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as DesignOpenedResponse;
    expect(body).toEqual({ tool: CLAUDE_DESIGN, folder: join(dir, "design") });
    expect(await readFile(log, "utf8")).toBe("https://claude.ai/design\n");
  });

  it("says how to open it by hand when the tool will not start", async () => {
    await boot(await fakeOpen("echo no window server >&2; exit 1"));
    const task = seed("other:claude-design:default:native");
    const response = await daemon.request(`/tasks/${task.id}/design/open`, { method: "POST" });
    expect(response.status).toBe(409);
    const error = await failure(response);
    expect(error.code).toBe("design-tool-failed");
    expect(error.hint).toContain(`agn open ${task.id} --tool`);
  });
});
