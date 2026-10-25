// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { Plus, Search, Pin, PinOff, Pencil, Trash2, MoreHorizontal, KeyRound, TerminalSquare, Settings, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import { useDesk, type View } from "@/lib/store";
import { Logo } from "./Logo";
import { Menu, MenuTrigger, MenuContent, MenuItem } from "./ui/dropdown";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { Session } from "@/lib/api";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const d = useDesk();
  const [q, setQ] = useState(d.search);
  const [rename, setRename] = useState<Session | null>(null);
  const [title, setTitle] = useState("");
  useEffect(() => { const t = setTimeout(() => d.setSearch(q), 250); return () => clearTimeout(t); }, [q]);

  if (collapsed) return (
    <aside className="flex w-14 flex-col items-center gap-2 border-r border-line bg-sidebar py-3">
      <button onClick={onToggle} className="rounded-ctl p-2 text-subtle hover:bg-raised hover:text-fg" title="Expand sidebar"><PanelLeft size={18} /></button>
      <button onClick={() => d.select(null)} className="rounded-ctl p-2 text-accent hover:bg-raised" title="New session"><Plus size={18} /></button>
    </aside>
  );

  const pinned = d.sessions.filter((s) => d.pins.includes(s.id));
  const recent = d.sessions.filter((s) => !d.pins.includes(s.id));
  const nav: { v: View; label: string; icon: any }[] = [
    { v: "providers", label: "Providers & models", icon: KeyRound },
    { v: "tools", label: "Harnesses & CLI", icon: TerminalSquare },
    { v: "settings", label: "Settings", icon: Settings },
  ];

  const Row = ({ s }: { s: Session }) => (
    <div className={cn("group flex h-8 items-center gap-1 rounded-ctl pl-2 pr-1 text-sm", d.selected?.id === s.id && d.view === "chat" ? "bg-raised text-fg" : "text-muted hover:bg-raised/70 hover:text-fg")}>
      <button className="flex-1 truncate text-left" onClick={() => d.select(s.id)} title={`${s.title}\n${s.cwd}`}>{s.title}</button>
      <Menu>
        <MenuTrigger className="rounded p-1 opacity-0 hover:bg-card group-hover:opacity-100 data-[state=open]:opacity-100" aria-label="Session actions"><MoreHorizontal size={14} /></MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={() => d.togglePin(s.id)}>{d.pins.includes(s.id) ? <><PinOff size={14} /> Unpin</> : <><Pin size={14} /> Pin</>}</MenuItem>
          <MenuItem onSelect={() => { setRename(s); setTitle(s.title); }}><Pencil size={14} /> Rename</MenuItem>
          <MenuItem className="text-bad" onSelect={() => { if (confirm(`Delete "${s.title}"?`)) d.remove(s).catch((e) => d.setError(e.message)); }}><Trash2 size={14} /> Delete</MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <Logo size={26} />
        <span className="font-serif text-[19px] tracking-tight">FCC Desk</span>
        <button onClick={onToggle} className="ml-auto rounded-ctl p-1.5 text-subtle hover:bg-raised hover:text-fg" title="Collapse sidebar"><PanelLeftClose size={16} /></button>
      </div>
      <div className="px-2">
        <button onClick={() => d.select(null)} className="flex h-9 w-full items-center gap-2 rounded-ctl px-2 text-sm font-medium text-fg hover:bg-raised">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-fg"><Plus size={14} /></span> New session
        </button>
        <div className="relative mt-1">
          <Search size={14} className="absolute left-2.5 top-2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions" className="h-8 w-full rounded-ctl bg-transparent pl-8 pr-2 text-sm placeholder:text-subtle outline-none hover:bg-raised/60 focus:bg-raised" />
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto px-2">
        {pinned.length > 0 && <><div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-subtle">Pinned</div>{pinned.map((s) => <Row key={s.id} s={s} />)}</>}
        <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-subtle">Recents</div>
        {recent.length === 0 && <div className="px-2 py-1 text-[13px] text-subtle">{d.search ? "No matches" : "No sessions yet"}</div>}
        {recent.map((s) => <Row key={s.id} s={s} />)}
      </div>
      <div className="border-t border-line p-2">
        <button onClick={() => d.setView("chat")} className={cn("flex h-8 w-full items-center gap-2 rounded-ctl px-2 text-sm", d.view === "chat" ? "text-fg" : "text-muted hover:bg-raised")}><MessageSquare size={15} /> Chat</button>
        {nav.map((n) => (
          <button key={n.v} onClick={() => d.setView(n.v)} className={cn("flex h-8 w-full items-center gap-2 rounded-ctl px-2 text-sm", d.view === n.v ? "bg-raised text-fg" : "text-muted hover:bg-raised")}><n.icon size={15} /> {n.label}</button>
        ))}
      </div>
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)} title="Rename session">
        <form onSubmit={async (e) => { e.preventDefault(); if (rename && title.trim()) { try { await d.patch(rename, { title: title.trim() }); } catch (er: any) { d.setError(er.message); } } setRename(null); }}>
          <Input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRename(null)}>Cancel</Button><Button variant="primary">Save</Button></div>
        </form>
      </Dialog>
    </aside>
  );
}
