import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { agPaths } from "./ag-layout.js";
import { looksLikeSecret, readMcpConfig } from "./mcp-config.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/mcp/", import.meta.url));

const dirs: string[] = [];

afterAll(async () => {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

/** A repo whose only `.ag/` file is the text under test. */
async function repoWith(yaml: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "agn-mcp-"));
  dirs.push(dir);
  await mkdir(agPaths(dir).dir, { recursive: true });
  await writeFile(agPaths(dir).mcpYaml, yaml, "utf8");
  return dir;
}

/** The message a user sees for a file agn will not read, with the key that caused it. */
async function refusal(yaml: string): Promise<string> {
  const failed = await readMcpConfig(await repoWith(yaml)).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failed).toMatchObject({ code: "ag-file-invalid" });
  return failed instanceof Error ? failed.message : String(failed);
}

const DB = "servers:\n  db:\n    command: npx\n";

describe("readMcpConfig", () => {
  it("reads the servers in file order, telling variables from literals", async () => {
    const config = await readMcpConfig(join(FIXTURES, "one-server"));
    expect(config?.servers.map((server) => server.name)).toEqual(["db", "docs"]);
    expect(config?.servers[0]).toEqual({
      name: "db",
      kind: "stdio",
      command: "npx",
      args: ["-y", "@acme/db-mcp"],
      env: {
        DATABASE_URL: { kind: "env", name: "DATABASE_URL" },
        LOG_LEVEL: { kind: "literal", value: "info" },
      },
    });
    expect(config?.servers[1]).toEqual({
      name: "docs",
      kind: "remote",
      url: "https://mcp.example.com/docs",
      headers: { Authorization: { kind: "env", name: "MCP_AUTH" } },
    });
  });

  it("is null in a repo with no mcp.yaml, and refuses one that is empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-mcp-"));
    dirs.push(dir);
    expect(await readMcpConfig(dir)).toBeNull();
    expect(await refusal("")).toContain("servers");
  });

  it("names the key of a value that is neither a literal nor a whole $NAME", async () => {
    for (const value of [`\${DB_URL}`, "Bearer $TOKEN", "$db-url"]) {
      const message = await refusal(`${DB}    env:\n      DATABASE_URL: "${value}"\n`);
      expect(message).toContain("servers.db.env.DATABASE_URL");
      expect(message).toContain("write the whole value as $NAME");
    }
  });

  it("refuses a server with both a command and a url, and one with neither", async () => {
    expect(await refusal(`${DB}    url: https://example.com\n`)).toContain(
      "command or url, never both",
    );
    expect(await refusal("servers:\n  db:\n    args: []\n")).toContain(
      "needs a command to run or a url to reach",
    );
  });

  it("refuses a key it does not know and a name no config file could hold", async () => {
    expect(await refusal(`${DB}    timeout: 5\n`)).toContain("timeout");
    expect(await refusal("servers:\n  my server:\n    command: npx\n")).toContain("my server");
  });

  it("refuses a server name with a slash, which neither a TOML key nor a JSON key allows raw", async () => {
    expect(await refusal("servers:\n  db/prod:\n    command: npx\n")).toContain("servers.db/prod");
  });

  it("refuses an empty servers mapping rather than reading it as none", async () => {
    expect(await refusal("servers: {}\n")).toContain("servers is empty");
  });

  it("names the file and the hint when the yaml itself does not parse", async () => {
    const dir = await repoWith("servers:\n  db:\n   command: [\n");
    await expect(readMcpConfig(dir)).rejects.toMatchObject({
      code: "ag-file-malformed",
      hint: expect.stringContaining("docs/mcp.md"),
    });
  });
});

/** The table `looksLikeSecret` carries, copied here so a prefix silently dropped from it fails a test. */
const SECRET_PREFIXES = [
  "sk-",
  "sk_",
  "pk_",
  "ghp_",
  "gho_",
  "github_pat_",
  "xoxa-",
  "xoxb-",
  "xoxp-",
  "AKIA",
  "AIza",
  "ya29.",
  "eyJ",
  "glpat-",
  "npm_",
  "-----BEGIN",
];

describe("looksLikeSecret", () => {
  it("flags every prefix in its table, whatever follows it", () => {
    for (const prefix of SECRET_PREFIXES) {
      expect(looksLikeSecret(`${prefix}restofthevalue`)).toBe(true);
    }
  });

  it("flags a short key already committed to its issuer's prefix", () => {
    const key = "ghp_abcdefghijklmnop1234";
    expect(key).toHaveLength(24);
    expect(looksLikeSecret(key)).toBe(true);
  });

  it("knows the shapes a credential is issued in without a prefix", () => {
    expect(looksLikeSecret("da39a3ee5e6b4b0d3255bfef95601890afd80709")).toBe(true);
    // A JWT: three dot-separated parts, each base64url - flagged by its eyJ prefix already,
    // and it would clear the entropy bar on its own even if that prefix were not in the table.
    expect(
      looksLikeSecret(
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ),
    ).toBe(true);
  });

  it("treats 32 characters as the floor a random value must clear, prefix or not", () => {
    // 31 characters of high-entropy text: false by the length rule alone, not by its entropy.
    const short = "aZ9kLp3xQ7mN2vR8tY5wB1cD4fG6hJ0";
    expect(short).toHaveLength(31);
    expect(looksLikeSecret(short)).toBe(false);
  });

  it("flags a long random value with no prefix, and leaves ordinary text of that length", () => {
    const random = "aZ9kLp3xQ7mN2vR8tY5wB1cD4fG6hJ0k";
    expect(random).toHaveLength(32);
    expect(looksLikeSecret(random)).toBe(true);
    // Long enough, no whitespace, no prefix, not hex - and under four bits a character.
    expect(looksLikeSecret("config-value-for-the-build-server")).toBe(false);
  });

  it("reads a value word by word, so a header literal is judged by the token in it", () => {
    expect(looksLikeSecret("Bearer ghp_16C7e42F292c6912E7710c838347Ae178B4a")).toBe(true);
    expect(looksLikeSecret("Bearer aZ9kLp3xQ7mN2vR8tY5wB1cD4fG6hJ0k")).toBe(true);
    // Every word of each of these is short, low-entropy, or both.
    expect(looksLikeSecret("the quick brown fox jumps over")).toBe(false);
    expect(looksLikeSecret("config-value-for-the-build-server")).toBe(false);
  });

  it("leaves a setting, a url and a command alone", () => {
    expect(looksLikeSecret("info")).toBe(false);
    expect(looksLikeSecret("https://mcp.example.com/docs")).toBe(false);
    expect(looksLikeSecret("npx")).toBe(false);
    expect(looksLikeSecret("the quick brown fox jumps over")).toBe(false);
  });

  it("leaves a long path and a long url alone, and an empty value", () => {
    expect(looksLikeSecret("/Users/agent/repos/repos/repos/repos/repos/repos/repos")).toBe(false);
    expect(looksLikeSecret("https://mcp.example.com/tools/list/all/tools")).toBe(false);
    expect(looksLikeSecret("")).toBe(false);
  });
});
