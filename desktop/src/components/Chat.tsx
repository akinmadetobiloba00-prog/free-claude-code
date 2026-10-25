// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRight, Wrench, Brain, ShieldQuestion, FolderGit2, AlertTriangle } from "lucide-react";
import { useDesk } from "@/lib/store";
import { code, type Item, type Prompt } from "@/lib/api";
import { Composer } from "./Composer";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["preparing", "running", "stopping"]);

function ToolCard({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const reasoning = item.kind === "reasoning";
  const Icon = reasoning ? Brain : Wrench;
  const label = reasoning ? "Thinking" : item.title || item.kind.replace(/_/g, " ");
  const body = reasoning ? null : item.detail || item.text;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="my-1.5 rounded-card border border-line bg-card/60">
      <Collapsible.Trigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted hover:text-fg">
        <ChevronRight size={14} className={cn("transition-transform", open && "rotate-90")} />
        <Icon size={14} />
        <span className="flex-1 truncate font-mono text-[12.5px]">{label}</span>
        {!item.complete && <span className="thinking-dot h-2 w-2 rounded-full bg-accent" />}
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t border-line px-3 py-2">
        {reasoning
          ? <div className="prose-fcc text-[13.5px] text-muted" dangerouslySetInnerHTML={{ __html: item.html ?? "" }} />
          : <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-[12px] text-muted">{body || "(no output)"}</pre>}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  const d = useDesk();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const f = prompt.form || {};
  const pending = prompt.status === "pending";
  const answer = async (value: Record<string, unknown>) => {
    if (!d.selected) return; setBusy(true); setErr(null);
    try { await code.answer(d.selected, prompt, value); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="my-3 rounded-card border border-[color-mix(in_oklab,var(--accent)_50%,var(--line))] bg-card p-3.5">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium"><ShieldQuestion size={16} className="text-accent" /> {f.title || "Approval needed"}</div>
      {f.detail && <pre className="mb-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-ctl bg-sidebar p-2 font-mono text-[12px] text-muted">{f.detail}</pre>}
      {!pending && <div className="text-[13px] text-subtle">{prompt.status === "resolved" ? "Answered" : prompt.status}</div>}
      {pending && prompt.kind === "approval" && (
        <div className="flex flex-wrap gap-2">
          {(f.choices || []).map((c: any, i: number) => (
            <Button key={c.id} size="sm" disabled={busy} variant={i === 0 ? "primary" : /decline|deny|cancel|reject/i.test(c.label) ? "danger" : "secondary"} onClick={() => answer({ choice: c.id })}>{c.label}</Button>
          ))}
        </div>
      )}
      {pending && prompt.kind === "permissions" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => answer({ selected: (f.choices || []).map((c: any) => c.id), scope: "turn" })}>Allow for this turn</Button>
          <Button size="sm" disabled={busy} onClick={() => answer({ selected: (f.choices || []).map((c: any) => c.id), scope: "session" })}>Allow for this session</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => answer({ selected: [], scope: "turn" })}>Deny</Button>
        </div>
      )}
      {pending && prompt.kind === "questions" && (
        <form onSubmit={(e) => { e.preventDefault(); answer({ answers: Object.fromEntries((f.questions || []).map((q: any) => [q.id, { answers: [answers[q.id] ?? ""] }])) }); }} className="space-y-2">
          {(f.questions || []).map((q: any) => (
            <label key={q.id} className="block text-[13px]"><span className="text-muted">{q.question || q.header}</span>
              {q.options?.length
                ? <select className="mt-1 h-8 w-full rounded-ctl border border-line bg-raised px-2" value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}><option value="">Choose…</option>{q.options.map((o: any) => <option key={o.label} value={o.label}>{o.label}</option>)}</select>
                : <input className="mt-1 h-8 w-full rounded-ctl border border-line bg-raised px-2" value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
            </label>
          ))}
          <Button size="sm" variant="primary" disabled={busy}>Send answer</Button>
        </form>
      )}
      {pending && !["approval", "permissions", "questions"].includes(prompt.kind) && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => answer({ action: "accept", values: {} })}>Accept</Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => answer({ action: "decline" })}>Decline</Button>
        </div>
      )}
      {err && <div className="mt-2 text-[13px] text-bad">{err}</div>}
    </div>
  );
}

export function Chat() {
  const d = useDesk();
  const s = d.selected!;
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const items = useMemo(() => [...d.live.items.values()].sort((a, b) => a.sequence - b.sequence), [d.live.items]);
  const busy = !!d.live.run && ACTIVE.has(d.live.run.status);
  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [items, d.live.prompts]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <h2 className="truncate text-[15px] font-medium">{s.title}</h2>
        {s.cwd && <span className="flex min-w-0 items-center gap-1 truncate text-[12px] text-subtle" title={s.cwd}><FolderGit2 size={13} /> {s.cwd}</span>}
        {busy && <span className="ml-auto flex items-center gap-1.5 text-[12px] text-muted"><span className="thinking-dot h-2 w-2 rounded-full bg-accent" /> Working…</span>}
      </header>
      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-5 py-6">
          {items.length === 0 && !busy && <p className="py-10 text-center text-sm text-subtle">No messages yet.</p>}
          {items.map((it) => {
            if (it.kind === "user") return (
              <div key={it.id} className="my-4 flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-card bg-raised px-3.5 py-2.5 text-[15px] leading-6">{it.text}</div></div>
            );
            if (it.kind === "text") return <div key={it.id} className="prose-fcc my-3 font-serif text-[16.5px] leading-7" dangerouslySetInnerHTML={{ __html: it.html ?? "" }} />;
            if (it.kind === "prompt") { if (!d.features.prompts) return null; const p = d.live.prompts.get(it.id); return p ? <PromptCard key={it.id} prompt={p} /> : null; }
            return <ToolCard key={it.id} item={it} />;
          })}
          {d.features.prompts && [...d.live.prompts.values()].filter((p) => p.status === "pending" && !d.live.items.has(p.id)).map((p) => <PromptCard key={p.id} prompt={p} />)}
          {busy && items.every((i) => i.kind === "user") && <div className="my-4 flex items-center gap-2 text-sm text-subtle"><span className="thinking-dot h-2.5 w-2.5 rounded-full bg-accent" /> Thinking…</div>}
          {d.live.run?.status === "failed" && d.live.run.error && <div className="my-3 flex gap-2 rounded-card border border-bad/40 bg-bad/10 p-3 text-[13px] text-bad"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {d.live.run.error}</div>}
          {d.live.notice && <div className="my-2 text-[12px] text-subtle">{d.live.notice}</div>}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[800px] px-5 pb-5">
        <Composer placeholder="Reply…" busy={busy} model={s.model} effort={s.reasoning_effort}
          onModel={(m) => d.patch(s, { model: m }).catch((e) => d.setError(e.message))}
          onEffort={(e) => d.patch(s, { reasoning_effort: e }).catch((er) => d.setError(er.message))}
          onStop={() => d.stop().catch((e) => d.setError(e.message))}
          onSend={async (t) => { stick.current = true; try { await d.send(t); } catch (e: any) { d.setError(e.message); throw e; } }} />
      </div>
    </div>
  );
}
