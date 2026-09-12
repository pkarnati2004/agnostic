import type { Migration } from "../migrate.js";

// The commit a task's branch started from, so agent lines stay measurable after a merge (ADR 022).
// Existing rows keep NULL, which every reader treats as "agn never recorded one".
export const taskBaseCommit: Migration = {
  version: 2,
  name: "task-base-commit",
  sql: `
ALTER TABLE tasks ADD COLUMN base_commit TEXT;
`,
};
