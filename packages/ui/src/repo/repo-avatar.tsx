import { cn } from "../class-names";

/** The repo's first letter, so a heading or a chip is recognisable before it is read. */
export function RepoAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded bg-input text-[10px] font-semibold",
        className,
      )}
    >
      {name.slice(0, 1).toLowerCase()}
    </span>
  );
}
