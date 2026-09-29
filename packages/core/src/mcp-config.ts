import { z } from "zod";
import { agPaths } from "./ag-layout.js";
import { readYamlFile } from "./yaml-file.js";

/** A value the file gives: either the text itself, or the name of a variable each agent expands. */
export type McpValue = { kind: "literal"; value: string } | { kind: "env"; name: string };

export type McpServer = { name: string } & (
  | { kind: "stdio"; command: string; args: string[]; env: Record<string, McpValue> }
  | { kind: "remote"; url: string; headers: Record<string, McpValue> }
);

export type McpConfig = { servers: McpServer[] };

/** A bare TOML key and a JSON key at once, so one name works in all three target files. */
const SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const VARIABLE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;

const VALUE_HINT = "write the whole value as $NAME and put the rest in the variable";

/**
 * Half a variable is never guessed at: `${NAME}` and `Bearer $TOKEN` would each mean something
 * different in the three target files, and one of them would leak the literal `$`.
 */
const ValueSchema = z
  .string()
  .check((ctx) => {
    if (ctx.value.includes("$") && !VARIABLE.test(ctx.value)) {
      ctx.issues.push({ code: "custom", input: ctx.value, message: VALUE_HINT });
    }
  })
  .transform((value): McpValue => {
    const variable = VARIABLE.exec(value);
    return variable?.[1] === undefined
      ? { kind: "literal", value }
      : { kind: "env", name: variable[1] };
  });

/**
 * One shape with every key optional rather than a union: a union reports both branches' failures
 * for one typo, and the two mistakes worth naming are "both" and "neither".
 */
const ServerSchema = z
  .strictObject({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string().min(1), ValueSchema).optional(),
    url: z.url().optional(),
    headers: z.record(z.string().min(1), ValueSchema).optional(),
  })
  .check((ctx) => {
    const message = transportProblem(ctx.value);
    if (message !== null) {
      ctx.issues.push({ code: "custom", input: ctx.value, message });
    }
  })
  .transform((server) =>
    server.command === undefined
      ? { kind: "remote" as const, url: server.url ?? "", headers: server.headers ?? {} }
      : {
          kind: "stdio" as const,
          command: server.command,
          args: server.args ?? [],
          env: server.env ?? {},
        },
  );

/** Only which keys the file set decides this, so the values stay whatever the schema made them. */
function transportProblem(server: {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  url?: unknown;
  headers?: unknown;
}): string | null {
  if (server.command !== undefined && server.url !== undefined) {
    return "a server has command or url, never both";
  }
  if (server.command === undefined && server.url === undefined) {
    return "a server needs a command to run or a url to reach";
  }
  if (server.command === undefined && (server.env !== undefined || server.args !== undefined)) {
    return "a remote server takes headers, not env or args";
  }
  if (server.url === undefined && server.headers !== undefined) {
    return "a command takes env, not headers";
  }
  return null;
}

/** The mapping becomes a list in file order: every target writes the servers the way they are read. */
export const McpConfigSchema: z.ZodType<McpConfig, unknown> = z
  .strictObject({
    servers: z.record(z.string().regex(SERVER_NAME), ServerSchema),
  })
  .check((ctx) => {
    if (Object.keys(ctx.value.servers).length === 0) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: "servers is empty; delete the file or name a server",
      });
    }
  })
  .transform((file) => ({
    servers: Object.entries(file.servers).map(([name, server]) => ({ name, ...server })),
  }));

/** Null when the repo does not declare any servers; a `ConfigError` when the file is unusable. */
export function readMcpConfig(repoPath: string): Promise<McpConfig | null> {
  const file = agPaths(repoPath).mcpYaml;
  return readYamlFile(file, McpConfigSchema, `Fix ${file}; see docs/mcp.md`);
}

/** Prefixes the issuers document; a value carrying one is a credential, whatever its entropy. */
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

const RANDOM_MIN_LENGTH = 32;

/** Measured over one word, so "aaaa…" and the words of a passphrase all stay literals. */
const RANDOM_MIN_ENTROPY = 4;

const HEX_DIGEST = /^[0-9a-fA-F]{32,}$/;

/**
 * What agn refuses to copy into a config file it writes. It is a guess, and it is meant to be a
 * loose one: a literal wrongly called a secret costs the user one `$NAME`, a secret written into
 * three files costs them the secret.
 */
export function looksLikeSecret(value: string): boolean {
  return value.split(/\s+/).some((word) => word.length > 0 && wordLooksLikeSecret(word));
}

/** One word at a time, so a header written whole - `Bearer ghp_…` - is judged by the token in it. */
function wordLooksLikeSecret(word: string): boolean {
  if (SECRET_PREFIXES.some((prefix) => word.startsWith(prefix))) {
    return true;
  }
  if (word.length < RANDOM_MIN_LENGTH) {
    return false;
  }
  // A 32-character digest tops out below 4 bits per character, and no setting is written as one.
  return HEX_DIGEST.test(word) || entropy(word) >= RANDOM_MIN_ENTROPY;
}

function entropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let bits = 0;
  for (const count of counts.values()) {
    const share = count / value.length;
    bits -= share * Math.log2(share);
  }
  return bits;
}
