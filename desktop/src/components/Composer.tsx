// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, FolderOpen } from "lucide-react";
import { ModelPicker, EffortPicker } from "./ModelPicker";
import { code } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ComposerProps {
  placeholder: string; busy?: boolean; disabled?: boolean;
  model: string; effort: string | null; onModel: (m: string) => void; onEffort: (e: string | null) => void;
  onSend: (text: string) => Promise<void> | void; onStop?: () => void;
  cwd?: string; onCwd?: (c: string) => void; big?: boolean;
}

export function Composer(p: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = ref.current; if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 320) + "px"; } }, [text]);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async () => {
    const v = text.trim(); if (!v || sending || p.disabled) return;
    setSending(true);
    try { await p.onSend(v); setText(""); } finally { setSending(false); }
  };
  const browse = async () => { try { const r = await code.pickFolder(p.cwd); if (r.path) p.onCwd?.(r.path); } catch { /* picker unavailable: user can type the path */ } };
  return (
    <div className={cn("rounded-composer border border-line bg-raised shadow-[0_4px_24px_rgba(0,0,0,0.18)] transition-colors focus-within:border-[color-mix(in_oklab,var(--accent)_45%,var(--line))]", p.big ? "p-3" : "p-2.5")}>
      <textarea ref={ref} value={text} rows={p.big ? 3 : 1} onChange={(e) => setText(e.target.value)} placeholder={p.placeholder}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[15px] leading-6 text-fg placeholder:text-subtle outline-none" aria-label="Message" />
      <div className="mt-1.5 flex items-center gap-1">
        {p.onCwd && (
          <div className="flex min-w-0 items-center gap-1 rounded-ctl text-[13px] text-muted">
            <button onClick={browse} className="rounded-ctl p-1.5 hover:bg-card hover:text-fg" title="Pick project folder"><FolderOpen size={15} /></button>
            <input value={p.cwd ?? ""} onChange={(e) => p.onCwd?.(e.target.value)} placeholder="Project folder (required)" className="h-7 w-[min(320px,40vw)] truncate rounded-ctl bg-transparent px-1 outline-none hover:bg-card focus:bg-card" aria-label="Project folder" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <EffortPicker model={p.model} value={p.effort} onChange={p.onEffort} />
          <ModelPicker value={p.model} onChange={p.onModel} />
          {p.busy ? (
            <button onClick={p.onStop} className="ml-1 grid h-8 w-8 place-items-center rounded-ctl bg-fg text-bg hover:opacity-85" title="Stop" aria-label="Stop"><Square size={13} fill="currentColor" /></button>
          ) : (
            <button onClick={submit} disabled={!text.trim() || sending || p.disabled} className="ml-1 grid h-8 w-8 place-items-center rounded-ctl bg-accent text-accent-fg transition hover:brightness-110 disabled:opacity-35" title="Send (Enter)" aria-label="Send"><ArrowUp size={16} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
