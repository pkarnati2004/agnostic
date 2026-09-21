import { describe, expect, it } from "vitest";
import { type Repo, RepoSchema } from "./repo.js";

const repo: Repo = {
  id: "r7k2m4pqrs",
  path: "/Users/dev/code/agnostic",
  kind: "git",
  name: "agnostic",
  addedAt: "2026-09-10T12:00:00.000Z",
  status: "active",
};

describe("RepoSchema", () => {
  it("parses a valid repo", () => {
    expect(RepoSchema.parse(repo)).toEqual(repo);
  });

  it("rejects the wrong type in every field", () => {
    const wrong: Record<keyof Repo, unknown> = {
      id: 7,
      path: 7,
      kind: "svn",
      name: null,
      addedAt: "yesterday",
      status: "gone",
    };
    for (const [field, value] of Object.entries(wrong)) {
      expect(RepoSchema.safeParse({ ...repo, [field]: value }).success).toBe(false);
    }
  });

  it("rejects an id that is not an agnostic id", () => {
    expect(RepoSchema.safeParse({ ...repo, id: "not-an-id" }).success).toBe(false);
  });

  it("reads a repo written before the status column as active", () => {
    const { status, ...before } = repo;
    expect(RepoSchema.parse(before).status).toBe("active");
  });

  it("parses an archived repo", () => {
    expect(RepoSchema.parse({ ...repo, status: "archived" }).status).toBe("archived");
  });

  it("parses a removed repo, and rejects a status the schema does not name", () => {
    expect(RepoSchema.parse({ ...repo, status: "removed" }).status).toBe("removed");
    expect(RepoSchema.safeParse({ ...repo, status: "gone" }).success).toBe(false);
  });
});
