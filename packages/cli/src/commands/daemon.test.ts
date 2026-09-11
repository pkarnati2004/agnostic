import { describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";

async function agn(
  args: string[],
  env: Record<string, string> = {},
): Promise<ReturnType<typeof createTestContext> & { code: number }> {
  const cli = createTestContext();
  const before = { ...process.env };
  Object.assign(process.env, env);
  try {
    return { ...cli, code: await runMain(["node", "agn", ...args], cli.ctx) };
  } finally {
    process.env = before;
  }
}

describe("agn daemon", () => {
  it("passes the subcommand and its flags through in order", async () => {
    const result = await agn(["daemon", "restart", "--force", "--port", "7431"]);
    expect(result.out).toEqual(["agnd-stub restart --force --port 7431"]);
    expect(result.code).toBe(0);
  });

  it("exits with the code the daemon bin returned", async () => {
    const result = await agn(["daemon", "status"], { AGND_STUB_EXIT: "1" });
    expect(result.out).toEqual(["agnd-stub status"]);
    expect(result.code).toBe(1);
  });

  it("puts the daemon's own stderr on stderr", async () => {
    const result = await agn(["daemon", "stop"], {
      AGND_STUB_EXIT: "1",
      AGND_STUB_STDERR: "agnd: not running",
    });
    expect(result.err).toEqual(["agnd: not running"]);
  });

  it("never asks for a daemon client, so status and stop start nothing", async () => {
    const cli = createTestContext();
    let connects = 0;
    cli.ctx.client = () => {
      connects += 1;
      return Promise.reject(new Error("a daemon command must not connect"));
    };
    expect(await runMain(["node", "agn", "daemon", "status"], cli.ctx)).toBe(0);
    expect(connects).toBe(0);
  });

  it("rejects --json, which only data commands answer", async () => {
    const result = await agn(["daemon", "status", "--json"]);
    expect(result.code).toBe(2);
    expect(result.err.join("\n")).toContain("--json");
  });
});
