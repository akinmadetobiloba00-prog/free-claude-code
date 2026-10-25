// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { THEMES, ACCENTS, applyTheme, loadTheme, type ThemeId } from "@/lib/theme";
import { getPort } from "@/lib/api";
import { useDesk, UPGRADE_CMD } from "@/lib/store";
import { openExternal } from "@/lib/native";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const PREVIEW: Record<ThemeId, [string, string, string]> = {
  "clay-dark": ["#141413", "#2a2a28", "#f4f3ee"], light: ["#f2f0e8", "#ffffff", "#1f1e1b"], oled: ["#000000", "#121212", "#f5f5f5"], contrast: ["#000000", "#111111", "#ffffff"],
};

export function Settings() {
  const [prefs, setPrefs] = useState(loadTheme);
  const [port, setPort] = useState(String(getPort()));
  const [name, setName] = useState(localStorage.getItem("fcc.name") || "");
  const set = (p: Partial<typeof prefs>) => { const n = { ...prefs, ...p }; setPrefs(n); applyTheme(n); };
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 py-8">
        <h1 className="font-serif text-[32px] font-light">Settings</h1>
        <h2 className="mt-6 text-[12px] font-medium uppercase tracking-wide text-subtle">Theme</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => {
            const [a, b, c] = PREVIEW[t.id];
            return (
              <button key={t.id} onClick={() => set({ theme: t.id })} className={cn("rounded-card border p-2 text-left", prefs.theme === t.id ? "border-accent" : "border-line hover:border-subtle")}>
                <div className="flex h-16 overflow-hidden rounded-ctl" style={{ background: a }}>
                  <div className="w-1/3" style={{ background: a }} />
                  <div className="flex flex-1 flex-col justify-end gap-1 p-1.5" style={{ background: b }}><div className="h-1.5 w-3/4 rounded" style={{ background: c, opacity: 0.6 }} /><div className="h-3 rounded" style={{ background: prefs.accent }} /></div>
                </div>
                <div className="mt-1.5 text-[13px] font-medium">{t.name}</div>
                <div className="text-[11px] text-subtle">{t.hint}</div>
              </button>
            );
          })}
        </div>
        <h2 className="mt-6 text-[12px] font-medium uppercase tracking-wide text-subtle">Accent colour</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {ACCENTS.map((c) => (
            <button key={c} onClick={() => set({ accent: c })} className="grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-bg" style={{ background: c, boxShadow: prefs.accent.toLowerCase() === c.toLowerCase() ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}` : undefined }} aria-label={c}>
              {prefs.accent.toLowerCase() === c.toLowerCase() && <Check size={14} color="#111" />}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-[13px] text-muted">Custom <input type="color" value={prefs.accent} onChange={(e) => set({ accent: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" /></label>
        </div>
        <h2 className="mt-6 text-[12px] font-medium uppercase tracking-wide text-subtle">General</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] text-muted">Your name (for the greeting)<Input className="mt-1" value={name} onChange={(e) => { setName(e.target.value); localStorage.setItem("fcc.name", e.target.value); }} /></label>
          <label className="text-[13px] text-muted">FCC server port<div className="mt-1 flex gap-2"><Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} /><Button onClick={() => { localStorage.setItem("fcc.port", port || "8082"); location.reload(); }}>Apply</Button></div></label>
        </div>
        <Compat />
        <About />
      </div>
    </div>
  );
}

/** Which fcc-server this app is talking to and which session API it detected. */
export function Compat() {
  const d = useDesk();
  const api = d.flavour === "code" ? "Code sessions (/admin/api/code)" : d.flavour === "chat" ? "Chat Sessions, compatibility mode (/admin/api/chat)" : "none found";
  return (
    <section className="mt-6">
      <h2 className="text-[12px] font-medium uppercase tracking-wide text-subtle">FCC server compatibility</h2>
      <div className="mt-2 rounded-card border border-line bg-card px-4 py-3 text-[13px] text-muted">
        <div>fcc-server version: <span className="font-mono text-fg">{d.fccVersion ?? "unknown"}</span></div>
        <div>Chat API: <span className="text-fg">{api}</span></div>
        {d.flavour === "chat" && <div className="mt-1 text-subtle">Project folders, approvals and access modes need a newer fcc. Upgrade: <code className="font-mono">{UPGRADE_CMD}</code></div>}
        {d.flavour === "none" && <div className="mt-1 text-warn">Chat is unavailable on this version. Upgrade: <code className="font-mono">{UPGRADE_CMD}</code></div>}
      </div>
    </section>
  );
}

export function About() {
  return (
    <section className="mt-10 rounded-card border border-line bg-card p-5">
      <div className="flex items-center gap-3"><Logo size={40} /><div><div className="font-serif text-xl">FCC Desk</div><div className="text-[12px] text-subtle">Version 0.1.0 · desktop app for Free Claude Code</div></div></div>
      <p className="mt-4 text-sm font-medium">Not affiliated with Anthropic.</p>
      <p className="mt-1 text-[13px] leading-5 text-muted">FCC Desk is an independent open-source project. Claude and Claude Code are trademarks of Anthropic, PBC. FCC Desk is built on Free Claude Code by Ali Khokhar and is licensed under the GNU AGPL-3.0-only. You can get its source code from the project repository.</p>
      <p className="mt-2 text-[12px] text-subtle">Fonts: Newsreader, Inter and JetBrains Mono (SIL Open Font License), bundled with the app.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openExternal("https://github.com/akinmadetobiloba00-prog/free-claude-code/tree/fcc-desk")}>Source code <ExternalLink size={12} /></Button>
        <Button size="sm" variant="ghost" onClick={() => openExternal("https://github.com/Alishahryar1/free-claude-code")}>Upstream FCC <ExternalLink size={12} /></Button>
        <Button size="sm" variant="ghost" onClick={() => openExternal(`http://127.0.0.1:${getPort()}/admin`)}>FCC Admin <ExternalLink size={12} /></Button>
      </div>
    </section>
  );
}
