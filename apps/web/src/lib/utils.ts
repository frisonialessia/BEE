import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names intelligently.
 *
 * `clsx` resolves conditional classes and `tailwind-merge` de-duplicates
 * conflicting Tailwind utilities (e.g. `p-2 p-4` -> `p-4`). This is the standard
 * helper used by every shadcn/ui component.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
