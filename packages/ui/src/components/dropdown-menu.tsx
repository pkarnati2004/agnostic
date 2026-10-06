// Copied from shadcn/ui `dropdown-menu`, MIT (c) shadcn, against @radix-ui/react-dropdown-menu
// rather than the unified radix-ui package, and trimmed to Root, Trigger, Group, Content, Item
// and Separator. The values are the design's: a 272 px card of 30 px rows on a hairline, radius 9.
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "../class-names";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[272px] overflow-hidden rounded-[9px] border border-border bg-popover p-1",
          "text-popover-foreground shadow-floating",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone = "default",
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  /** The design draws one red row per menu, and only ever the one that deletes something. */
  tone?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-tone={tone}
      className={cn(
        "relative flex min-h-[30px] cursor-default select-none items-center gap-2.5 rounded-md",
        "px-2.5 py-1",
        "text-[12.5px] outline-none focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        tone === "destructive" && "text-destructive focus:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}
