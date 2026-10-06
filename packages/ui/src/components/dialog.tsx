// Copied from shadcn/ui `dialog`, MIT (c) shadcn, against @radix-ui/react-dialog rather than the
// unified radix-ui package, and trimmed to the parts the workspace uses. The frame is the design's:
// 580 px, radius 12, header and footer on hairlines, and the body the only part that scrolls.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../class-names";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className="fixed inset-0 z-50 bg-black/60"
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 grid w-full",
          // One column that can shrink below its content: a grid track's minimum is otherwise the
          // widest unwrappable child (a select value, a badge), which pushed the dialog's content
          // past 580 px and clipped its right edge.
          "grid-cols-[minmax(0,1fr)]",
          "max-w-[580px] gap-0 overflow-hidden rounded-xl border border-border bg-popover p-0",
          "shadow-floating",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          className={cn(
            "absolute top-[15px] right-[18px] rounded-sm text-muted-foreground opacity-70",
            "transition-opacity hover:opacity-100 focus-visible:outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          <X className="size-3.5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-0.5 border-border border-b px-[18px] py-[14px] pr-10 text-left",
        "type-title",
        className,
      )}
      {...props}
    />
  );
}

/** Everything between the two hairlines. The header and the footer keep their own padding. */
export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex flex-col gap-3.5 px-[18px] py-4", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex justify-end gap-2 border-border border-t px-[18px] py-3", className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("type-title", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("font-normal text-muted-foreground type-meta", className)}
      {...props}
    />
  );
}
