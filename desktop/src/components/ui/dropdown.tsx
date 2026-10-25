// SPDX-License-Identifier: AGPL-3.0-only
// shadcn/ui-style DropdownMenu on Radix.
import * as M from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export function MenuContent({ children, className, align = "start" }: { children: ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-[220px] max-h-[60vh] overflow-y-auto rounded-card border border-line bg-raised p-1 shadow-xl", className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}
export function MenuItem({ children, onSelect, className }: { children: ReactNode; onSelect?: () => void; className?: string }) {
  return (
    <M.Item onSelect={onSelect} className={cn("flex cursor-pointer items-center gap-2 rounded-ctl px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-card", className)}>
      {children}
    </M.Item>
  );
}
export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-subtle">{children}</M.Label>;
}
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
