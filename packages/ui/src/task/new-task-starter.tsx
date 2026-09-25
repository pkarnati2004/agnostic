import type { RepoListRow } from "@agnostic/core";
import { FolderPlus } from "lucide-react";
import { Button } from "../components/button";

/** agn's mark: a 3×3 of blocks, two of them holes, the middle one lit. */
const MARK_BLOCKS = ["nw", "n", "ne", "w", "c", "e", "sw", "s", "se"] as const;
const MARK_HOLES: ReadonlySet<string> = new Set(["n", "s"]);

/** What the centre asks with no tab in front of it, and how a machine with no repo gets one. */
export function NewTaskStarter({
  repos,
  onAddRepo,
}: {
  repos: RepoListRow[];
  onAddRepo: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <span aria-hidden className="grid grid-cols-[repeat(3,9px)] gap-1">
        {MARK_BLOCKS.map((cell) => (
          <span
            key={cell}
            className="h-[9px] rounded-sm"
            style={{ backgroundColor: blockColour(cell) }}
          />
        ))}
      </span>
      <h1 className="type-display">What should an agent work on?</h1>
      {repos.length === 0 && (
        <Button variant="ghost" onClick={onAddRepo}>
          <FolderPlus />
          Add a repo from this machine
        </Button>
      )}
    </div>
  );
}

function blockColour(cell: string): string | undefined {
  if (MARK_HOLES.has(cell)) {
    return undefined;
  }
  return cell === "c" ? "var(--status-waiting)" : "var(--muted-foreground)";
}
