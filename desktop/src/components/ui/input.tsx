// SPDX-License-Identifier: AGPL-3.0-only
import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-8 w-full rounded-ctl border border-line bg-card px-2.5 text-sm text-fg placeholder:text-subtle outline-none focus:border-accent", className)} {...props} />
));
Input.displayName = "Input";
