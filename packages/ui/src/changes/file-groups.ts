import type { ChangedFile, ChangedFileState } from "@agnostic/core";

export type FileGroup = {
  state: ChangedFileState;
  label: "Unstaged" | "Staged" | "Committed";
  files: ChangedFile[];
};

const LABELS: Record<ChangedFileState, FileGroup["label"]> = {
  unstaged: "Unstaged",
  staged: "Staged",
  committed: "Committed",
};

/** Partition in wire order, which the daemon already sorted; an empty group is left out. */
export function fileGroups(files: ChangedFile[]): FileGroup[] {
  const groups: FileGroup[] = [];
  for (const state of ["unstaged", "staged", "committed"] as const) {
    const inState = files.filter((file) => file.state === state);
    if (inState.length > 0) {
      groups.push({ state, label: LABELS[state], files: inState });
    }
  }
  return groups;
}

/** With every row committed the list looks as it does today: no heading. */
export function showGroupHeadings(groups: FileGroup[]): boolean {
  return groups.some((group) => group.state !== "committed");
}
