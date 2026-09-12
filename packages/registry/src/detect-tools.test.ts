import { fileURLToPath } from "node:url";
import { setProcessLog } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { detectTools } from "./detect-tools.js";

const BIN = fileURLToPath(new URL("../../../tests/fixtures/bin", import.meta.url));
const HOME = fileURLToPath(new URL("../../../tests/fixtures/home", import.meta.url));

function detect(home: string, path = `${BIN}/tools`) {
  return detectTools({ env: { PATH: path }, home, versionTimeoutMs: 5_000 });
}

describe("detectTools", () => {
  it("reports gh's path and version, and reads the login from its own file", async () => {
    expect(await detect(`${HOME}/gh-in`)).toEqual([
      { tool: "gh", path: `${BIN}/tools/gh`, version: "2.96.0", login: "logged-in" },
    ]);
  });

  it("reports a hosts file with no account as logged out", async () => {
    expect((await detect(`${HOME}/gh-out`))[0]?.login).toBe("logged-out");
  });

  it("reports no hosts file as unknown, because GH_TOKEN leaves none", async () => {
    expect((await detect(`${HOME}/empty`))[0]?.login).toBe("unknown");
  });

  it("reports gh that is not installed", async () => {
    expect(await detect(`${HOME}/gh-in`, `${BIN}/none`)).toEqual([
      { tool: "gh", path: null, version: null, login: "unknown" },
    ]);
  });

  it("never asks gh about the login, which would call the network", async () => {
    const commands: string[] = [];
    setProcessLog((entry) => commands.push([entry.command, ...entry.args].join(" ")));
    try {
      await detect(`${HOME}/gh-in`);
    } finally {
      setProcessLog(null);
    }
    expect(commands).toEqual([`${BIN}/tools/gh --version`]);
  });
});
