import type { Profile } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { profilesCommand } from "./profiles.js";

function profile(over: Partial<Profile>): Profile {
  return {
    id: "claude-code:default:native",
    harness: "claude-code",
    model: null,
    route: "native",
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
    ...over,
  };
}

describe("agn profiles", () => {
  it("keeps the order the daemon returned and dates the detection", async () => {
    const profiles = [
      profile({}),
      profile({
        id: "other:aider:default:native",
        harness: "other:aider",
        tier: 2,
        billing: "api-key",
        evidence: "env",
      }),
    ];
    const cli = createTestContext({
      client: {
        profiles: () => Promise.resolve({ profiles, detectedAt: "2026-09-11T10:00:00.000Z" }),
      },
    });
    await profilesCommand(cli.ctx).parseAsync([], { from: "user" });
    expect(cli.out).toEqual([
      "id                          billing       support  evidence",
      "claude-code:default:native  subscription  full     binary",
      "other:aider:default:native  api-key       basic    env",
      "detected 2026-09-11T10:00:00.000Z",
    ]);
  });

  it("prints the header alone when nothing is available", async () => {
    const cli = createTestContext({
      client: {
        profiles: () => Promise.resolve({ profiles: [], detectedAt: "2026-09-11T10:00:00.000Z" }),
      },
    });
    await profilesCommand(cli.ctx).parseAsync([], { from: "user" });
    expect(cli.out).toEqual([
      "id  billing  support  evidence",
      "detected 2026-09-11T10:00:00.000Z",
    ]);
  });

  it("prints the response verbatim with --json", async () => {
    const response = { profiles: [profile({})], detectedAt: "2026-09-11T10:00:00.000Z" };
    const cli = createTestContext({ client: { profiles: () => Promise.resolve(response) } });
    cli.ctx.json = true;
    await profilesCommand(cli.ctx).parseAsync([], { from: "user" });
    expect(JSON.parse(cli.out.join("\n"))).toEqual(response);
  });
});
