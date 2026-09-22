import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  claudeModelListRequest,
  parseClaudeModelList,
  parseCodexModelList,
  parseCursorModelList,
  parseGrokModelList,
  parseOpenCodeModelList,
  parsePiModelList,
} from "./model-list-parsers.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/model-lists", import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${FIXTURES}/${name}`, "utf8");
}

describe("parseClaudeModelList", () => {
  it("reads the control response, skipping the system line and the unparseable one", () => {
    expect(parseClaudeModelList(fixture("claude.jsonl"))).toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku",
    ]);
  });

  it("drops the disabled placeholder and the default mirror row", () => {
    const ids = parseClaudeModelList(fixture("claude.jsonl"));
    expect(ids).not.toContain("cc-update-required-1");
    expect(ids).not.toContain("default");
  });

  it("returns nothing for a CLI that answers the request with an error", () => {
    expect(parseClaudeModelList(fixture("claude-old-cli.jsonl"))).toEqual([]);
    expect(parseClaudeModelList("")).toEqual([]);
    expect(parseClaudeModelList("{ control_response")).toEqual([]);
  });

  it("de-duplicates ids the CLI repeats", () => {
    const line = JSON.stringify({
      type: "control_response",
      response: {
        subtype: "success",
        response: { models: [{ value: "opus" }, { value: "opus" }] },
      },
    });
    expect(parseClaudeModelList(line)).toEqual(["opus"]);
  });

  it("asks for the model list without starting a chat", () => {
    expect(JSON.parse(claudeModelListRequest)).toEqual({
      type: "control_request",
      request_id: "agn-model-list",
      request: { subtype: "list_models" },
    });
  });
});

describe("parseCodexModelList", () => {
  it("returns the slugs in order and drops the row without one", () => {
    expect(parseCodexModelList(fixture("codex.json"))).toEqual(["gpt-6-astra", "gpt-5.6-sol"]);
  });

  it("returns nothing for output that is not the listing", () => {
    expect(parseCodexModelList("codex-cli 0.50.1")).toEqual([]);
    expect(parseCodexModelList("{}")).toEqual([]);
  });

  it("drops the rows the CLI marks hidden", () => {
    const slugs = parseCodexModelList(fixture("codex.json"));
    expect(slugs).not.toContain("gpt-reserve");
    expect(slugs).not.toContain("codex-auto-review");
  });

  // Codex 0.154.0 prints `visibility` on every row, so a row without it is a row we cannot show a
  // user honestly; the seed list covers a CLI whose listing we no longer understand.
  it("drops a row that does not say it is listed", () => {
    const rows = {
      models: [
        { slug: "gpt-5.5", display_name: "GPT-5.5" },
        { slug: "gpt-5.6-luna", display_name: "GPT-5.6 Luna", visibility: "internal" },
      ],
    };
    expect(parseCodexModelList(JSON.stringify(rows))).toEqual([]);
  });

  it("lists a slug once", () => {
    const twice = {
      models: [
        { slug: "gpt-5.5", display_name: "A", visibility: "list" },
        { slug: "gpt-5.5", display_name: "B", visibility: "list" },
      ],
    };
    expect(parseCodexModelList(JSON.stringify(twice))).toEqual(["gpt-5.5"]);
  });
});

describe("parseOpenCodeModelList", () => {
  it("keeps one id per line and drops blanks, prose and duplicates", () => {
    expect(parseOpenCodeModelList(fixture("opencode.txt"))).toEqual([
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-5.5",
      "moonshotai/kimi-k2.6",
    ]);
  });

  it("reads CR, LF and CRLF the same way", () => {
    const ids = ["anthropic/claude-sonnet-4-5", "openai/gpt-5.5"];
    expect(parseOpenCodeModelList(ids.join("\r\n"))).toEqual(ids);
    expect(parseOpenCodeModelList(ids.join("\n"))).toEqual(ids);
    expect(parseOpenCodeModelList(ids.join("\r"))).toEqual(ids);
  });
});

describe("parsePiModelList", () => {
  it("joins the first two columns and skips the header and the short line", () => {
    expect(parsePiModelList(fixture("pi.txt"))).toEqual([
      "github-copilot/gpt-5.4-mini",
      "anthropic/claude-sonnet-4-5",
      "ollama/qwen3:8b",
    ]);
  });

  it("treats a non-breaking space as a column separator", () => {
    const row = ["ollama", "qwen3:8b", "32000", "8000", "no", "ready"].join(" ");
    expect(parsePiModelList(row)).toEqual(["ollama/qwen3:8b"]);
  });

  it("returns nothing for output that is not a table", () => {
    expect(parsePiModelList("pi 0.14.2")).toEqual([]);
  });

  it("ends a row on a bare carriage return too", () => {
    const rows = ["ollama qwen3:8b 32000 8000 no ready", "anthropic sonnet 200000 64000 yes ready"];
    expect(parsePiModelList(rows.join("\r"))).toEqual(["ollama/qwen3:8b", "anthropic/sonnet"]);
  });

  it("lists a provider and model pair once", () => {
    const row = "ollama qwen3:8b 32000 8000 no ready";
    expect(parsePiModelList([row, row].join("\n"))).toEqual(["ollama/qwen3:8b"]);
  });
});

describe("parseCursorModelList", () => {
  it("reads the id off each `<id> - <label>` line and skips the heading", () => {
    expect(parseCursorModelList(fixture("cursor.txt"))).toEqual(["auto", "gpt-5.2", "sonnet-4.5"]);
  });

  it("lists an id once, whatever its label says", () => {
    const rows = ["auto - Auto", "auto - Auto (current)"];
    expect(parseCursorModelList(rows.join("\n"))).toEqual(["auto"]);
  });

  it.each([
    ["", []],
    ["nothing to list\n\n", []],
  ])("reads %s as no models", (output, ids) => {
    expect(parseCursorModelList(output)).toEqual(ids);
  });
});

describe("parseGrokModelList", () => {
  it("reads the bulleted rows under the header and nothing above or below them", () => {
    // Regression from Orca: grok stars only the default row and dashes the rest, so a `*`-only
    // pattern published a one-model list. The `Default model:` line and the footer bullet are
    // both id-shaped and neither is a model.
    expect(parseGrokModelList(fixture("grok.txt"))).toEqual(["grok-4.6", "grok-4.5"]);
  });

  it("does not make the trailing marker part of the id, spaced or not", () => {
    const listed = "Available models:\n  * grok-4.5 (default)\n  * grok-build(beta)\n";
    expect(parseGrokModelList(listed)).toEqual(["grok-4.5", "grok-build"]);
  });

  it("lists each id once, in the order grok printed it", () => {
    const listed = "Available models:\n  * grok-4.5 (default)\n  * grok-build\n  * grok-4.5\n";
    expect(parseGrokModelList(listed)).toEqual(["grok-4.5", "grok-build"]);
  });

  it("still reads a listing whose first row sits under a blank line", () => {
    expect(parseGrokModelList("Available models:\n\n  * grok-4.5\n")).toEqual(["grok-4.5"]);
  });

  it("returns nothing without the header, whatever follows it", () => {
    expect(parseGrokModelList("Models:\n  * grok-4.5 (default)\n")).toEqual([]);
    expect(parseGrokModelList("Default model: grok-4.5\n")).toEqual([]);
    expect(parseGrokModelList("")).toEqual([]);
  });

  it("returns nothing for a header with no id under it", () => {
    expect(parseGrokModelList("Available models:\n  * \n  * (default)\n")).toEqual([]);
  });

  it("reads CRLF line endings", () => {
    expect(parseGrokModelList("Available models:\r\n  * grok-4.5 (default)\r\n")).toEqual([
      "grok-4.5",
    ]);
  });

  // `grok models` has no `--json` and no documented `--no-color`, so a build of the CLI that
  // colorizes its output even when stdout is not a terminal reaches this parser with escape codes.
  it("finds the header when ANSI codes wrap it", () => {
    const ansi =
      "\u001b[1mAvailable models:\u001b[0m\n  \u001b[32m*\u001b[0m grok-4.6 (default)\n  - grok-4.5\n";
    expect(parseGrokModelList(ansi)).toEqual(["grok-4.6", "grok-4.5"]);
  });

  it("keeps the escape codes out of the id when the id itself is colored", () => {
    const ansi =
      "Available models:\n  * \u001b[1mgrok-4.6\u001b[0m (default)\n  - \u001b[1mgrok-4.5\u001b[0m\n";
    expect(parseGrokModelList(ansi)).toEqual(["grok-4.6", "grok-4.5"]);
  });

  it("reads a colored id under a blank first row", () => {
    const ansi = "Available models:\n\n  * \u001b[1mgrok-4.6\u001b[0m\n";
    expect(parseGrokModelList(ansi)).toEqual(["grok-4.6"]);
  });
});
