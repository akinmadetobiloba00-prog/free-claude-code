// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { X, Loader2, RotateCw } from "lucide-react";
import { DeskProvider, useDesk } from "@/lib/store";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./components/Home";
import { Chat } from "./components/Chat";
import { Providers } from "./components/Providers";
import { Tools } from "./components/Tools";
import { Settings } from "./components/Settings";
import { Logo } from "./components/Logo";
import { Button } from "./components/ui/button";

function Shell() {
  const d = useDesk();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("fcc.sidebar") === "collapsed");
  useEffect(() => { localStorage.setItem("fcc.sidebar", collapsed ? "collapsed" : "open"); }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); d.select(null); }
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); setCollapsed((c) => !c); }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); d.setView("settings"); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [d]);
  useEffect(() => { if (d.error) { const t = setTimeout(() => d.setError(null), 8000); return () => clearTimeout(t); } }, [d.error]);

  if (d.phase !== "ready") return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-md flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="mt-5 font-serif text-3xl font-light">FCC Desk</h1>
        {d.phase === "connecting"
          ? <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> {d.phaseMessage}</p>
          : <><p className="mt-3 text-sm text-bad">{d.phaseMessage}</p><Button className="mt-4" variant="primary" onClick={d.retry}><RotateCw size={14} /> Try again</Button></>}
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="relative min-w-0 flex-1">
        {d.view === "providers" ? <Providers /> : d.view === "tools" ? <Tools /> : d.view === "settings" ? <Settings /> : d.selected ? <Chat key={d.selected.id} /> : <Home />}
        {d.error && (
          <div role="alert" className="absolute bottom-24 left-1/2 z-30 flex max-w-[560px] -translate-x-1/2 items-start gap-2 rounded-card border border-bad/40 bg-card px-3 py-2 text-[13px] text-bad shadow-xl">
            <span className="flex-1">{d.error}</span><button onClick={() => d.setError(null)} aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <DeskProvider><Shell /></DeskProvider>;
}
