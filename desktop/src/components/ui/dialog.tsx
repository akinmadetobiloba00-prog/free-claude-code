// SPDX-License-Identifier: AGPL-3.0-only
// shadcn/ui-style Dialog on Radix.
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Dialog({ open, onOpenChange, title, children, className }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <D.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[min(520px,92vw)] max-h-[86vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-card p-5 shadow-2xl", className)}>
          <div className="mb-3 flex items-center justify-between">
            <D.Title className="font-serif text-xl">{title}</D.Title>
            <D.Close className="rounded-ctl p-1 text-subtle hover:bg-raised hover:text-fg" aria-label="Close"><X size={16} /></D.Close>
          </div>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
