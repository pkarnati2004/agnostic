import type { ReactNode } from "react";

type SettingsRowProps = {
  label: ReactNode;
  description?: ReactNode;
  /** The control, on the right of the row. */
  children: ReactNode;
};

/** One setting: what it is called, what it does, and the control that changes it. */
export function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-6 border-border border-b py-3.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px]">{label}</span>
        {description !== undefined && (
          <span className="text-muted-foreground type-meta">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A heading over a group of rows, with the sentence that says what the group is for. */
export function SettingsGroupHeading({
  title,
  count,
  description,
}: {
  title: string;
  /** How many of the group's rows are on screen, when a filter hides the rest. */
  count?: string;
  description?: ReactNode;
}) {
  return (
    <div className="mt-7 flex flex-col gap-1">
      <span className="flex items-baseline gap-2">
        <span className="font-semibold text-[13.5px]">{title}</span>
        {count !== undefined && <span className="text-muted-foreground type-meta">{count}</span>}
      </span>
      {description !== undefined && (
        <span className="text-muted-foreground type-meta">{description}</span>
      )}
    </div>
  );
}
