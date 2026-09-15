import type { Migration } from "../migrate.js";

// A closed repo keeps its usage and outcome history (ADR 032), so status replaces deleting a row.
// Every row written before this migration reads as active.
export const repoStatus: Migration = {
  version: 3,
  name: "repo-status",
  sql: `
ALTER TABLE repos ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));
`,
};
