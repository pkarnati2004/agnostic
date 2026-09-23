import type { Migration } from "../migrate.js";

// The group an `agn compare` started a task in, shared by its siblings and NULL for every other
// row (ADR 036 Q7). The index carries both reads: the siblings of one compare, and the prefix
// lookup a user's short id goes through.
export const taskCompareId: Migration = {
  version: 6,
  name: "task-compare-id",
  sql: `
ALTER TABLE tasks ADD COLUMN compare_id TEXT;
CREATE INDEX tasks_compare ON tasks(compare_id);
`,
};
