import type { ReactNode } from "react";
import { cn } from "../class-names";

/** The bordered table the Shortcuts list draws in, which every list of rows in Settings uses. */
export function SettingsBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-3.5 overflow-hidden rounded-[10px] border border-border bg-sidebar",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One line of a box. The header line carries the count and the button that refreshes it. */
export function SettingsBoxRow({
  children,
  muted = false,
}: {
  children: ReactNode;
  /** The box's own header, which reads quieter than the rows under it. */
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-border border-b px-3.5 py-2.5 last:border-b-0",
        muted && "bg-muted/40 text-muted-foreground type-meta",
      )}
    >
      {children}
    </div>
  );
}
