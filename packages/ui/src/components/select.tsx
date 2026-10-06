// From shadcn/ui (MIT © shadcn).
// The values are the design's: a 30 px trigger that reads as one line, and a floating list of
// 30 px rows.
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../class-names";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

/** The heading over a group of items, in the same small caps as a label on the page. */
export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-muted-foreground type-label", className)}
      {...props}
    />
  );
}

/** The design draws two: a field-width line of mono, and the composer's own filled 24 px chip. */
export type SelectTriggerSize = "default" | "chip";

const TRIGGER_SIZES: Record<SelectTriggerSize, string> = {
  default: "h-[30px] w-full rounded-[7px] border border-input bg-transparent px-2.5",
  chip: "h-6 rounded-md bg-accent px-2 text-accent-foreground type-meta",
};

export function SelectTrigger({
  className,
  children,
  size = "default",
  mono = false,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: SelectTriggerSize;
  /** The design sets a value in mono only where it is an id; prose values stay in the body face. */
  mono?: boolean;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex items-center justify-between gap-2 whitespace-nowrap outline-none",
        size === "default" && (mono ? "type-mono-lg" : "type-body"),
        "data-[placeholder]:text-muted-foreground data-[state=open]:border-ring",
        "data-[state=open]:ring-[3px] data-[state=open]:ring-ring/15",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        TRIGGER_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "relative z-50 max-h-96 min-w-32 overflow-hidden rounded-[9px] border border-border",
          "bg-popover p-1 text-popover-foreground shadow-floating",
          position === "popper" && "translate-y-1",
          className,
        )}
        {...props}
      >
        <ScrollButton direction="up" />
        <SelectPrimitive.Viewport
          className={cn(
            position === "popper" && "w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <ScrollButton direction="down" />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-[30px] w-full cursor-default select-none items-center gap-2 rounded-md",
        "pr-8 pl-2 text-[12px] outline-none focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function ScrollButton({ direction }: { direction: "up" | "down" }) {
  const Button =
    direction === "up" ? SelectPrimitive.ScrollUpButton : SelectPrimitive.ScrollDownButton;
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <Button className="flex cursor-default items-center justify-center py-1">
      <Icon className="size-3.5" />
    </Button>
  );
}
