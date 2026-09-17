import type { ReactNode } from "react";

/** A heading and the rows under it: "Needs you" and every repo are drawn the same way. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-2 pt-3">
      <div className="flex items-center gap-1 px-2 pb-1">
        <h2 className="min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {title}
        </h2>
        {action}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
