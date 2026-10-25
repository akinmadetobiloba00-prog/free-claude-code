// SPDX-License-Identifier: AGPL-3.0-only
// shadcn/ui-style Button (cva + tailwind-merge), adapted to FCC Desk tokens.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:brightness-110",
        secondary: "bg-raised text-fg border border-line hover:bg-card",
        ghost: "text-muted hover:bg-raised hover:text-fg",
        danger: "bg-bad/15 text-bad hover:bg-bad/25",
      },
      size: { sm: "h-7 px-2.5 text-[13px]", md: "h-8 px-3", lg: "h-10 px-4", icon: "h-8 w-8" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
