import { type HarnessId, PlanVendorSchema } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { harnessForVendor, harnessIdentities, harnessIdentity } from "./harness-identity.js";
import { harnessDefinition, harnesses } from "./harness-list.js";

describe("the seven fields shared code dispatches on", () => {
  it("gives every row a mark, and every row with a plan source a vendor to bill it to", () => {
    for (const def of harnesses) {
      expect(def.mark, def.id).not.toBe("");
      if (def.planSource !== null) {
        expect(def.vendor, def.id).not.toBeNull();
      }
    }
  });

  it("pins the four rows agn both hooks and counts tokens for", () => {
    expect(row("claude-code")).toMatchObject({
      mark: "C",
      vendor: "claude",
      limitSource: "statusline",
      usageSource: { kind: "transcripts", dir: ".claude/projects" },
      mcp: { file: ".mcp.json", scope: "repo", syntax: "mcp-json" },
      headlessDetect: { kind: "flag", flags: ["-p", "--print", "--output-format"] },
    });
    expect(row("codex")).toMatchObject({
      mark: "X",
      vendor: "chatgpt",
      limitSource: "rollout",
      usageSource: { kind: "transcripts", dir: ".codex/sessions" },
      mcp: { file: ".codex/config.toml", scope: "user", syntax: "codex-toml" },
      headlessDetect: { kind: "subcommand", name: "exec" },
    });
    expect(row("pi")).toMatchObject({ mark: "\u03c0", vendor: null, mcp: null });
    expect(row("opencode")).toMatchObject({
      mark: "O",
      mcp: { file: "opencode.json", scope: "repo", syntax: "opencode-json" },
    });
  });

  it("only takes a rollout limit from a harness whose transcripts agn reads", () => {
    for (const def of harnesses.filter((r) => r.limitSource === "rollout")) {
      expect(def.usageSource?.kind, def.id).toBe("transcripts");
    }
  });

  it("names a headless form exactly when it knows argv for one", () => {
    for (const def of harnesses) {
      expect(def.headlessDetect !== null, def.id).toBe(def.headless !== null);
    }
  });

  it("gives every definition the identity row's name, mark and vendor", () => {
    expect(harnesses.map((def) => def.id)).toEqual(harnessIdentities.map((row) => row.id));
    for (const def of harnesses) {
      const identity = harnessIdentity(def.id);
      expect({ name: def.name, mark: def.mark, vendor: def.vendor }).toEqual({
        name: identity.name,
        mark: identity.mark,
        vendor: identity.vendor,
      });
    }
  });

  it("gives every vendor that bills a plan exactly one harness to mark it with", () => {
    for (const vendor of PlanVendorSchema.options) {
      const claiming = harnessIdentities.filter((row) => row.vendor === vendor);
      expect(claiming, vendor).toHaveLength(1);
      expect(harnessForVendor(vendor)).toEqual(claiming[0]);
    }
  });
});

function row(id: HarnessId) {
  return harnessDefinition(id);
}
