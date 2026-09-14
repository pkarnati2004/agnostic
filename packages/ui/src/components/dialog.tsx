// Copied from shadcn/ui `dialog`, MIT (c) shadcn, against @radix-ui/react-dialog rather than the
// unified radix-ui package, and trimmed to the parts the workspace uses.
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
          "-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 grid w-full max-w-lg",
          "gap-4 rounded-lg border border-border bg-background p-6 shadow-floating",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          className={cn(
            "absolute top-4 right-4 rounded-sm text-muted-foreground opacity-70",
            "transition-opacity hover:opacity-100 focus-visible:outline-none",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          <X className="size-4" />
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
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div data-slot="dialog-footer" className={cn("flex justify-end gap-2", className)} {...props} />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-semibold text-lg leading-none", className)}
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
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}
