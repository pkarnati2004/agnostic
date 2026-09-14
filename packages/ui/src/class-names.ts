import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Conditional classes, with the later Tailwind utility winning over the earlier one. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
