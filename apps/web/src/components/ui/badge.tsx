import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-background text-foreground",
        success:
          "border-transparent bg-[color-mix(in_srgb,var(--color-chart-5)_25%,var(--color-background))] text-foreground",
        warning:
          "border-transparent bg-[color-mix(in_srgb,var(--color-chart-1)_30%,var(--color-background))] text-foreground",
        destructive:
          "border-transparent bg-[color-mix(in_srgb,var(--color-chart-2)_25%,var(--color-background))] text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
