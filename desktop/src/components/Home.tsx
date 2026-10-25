// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import { useDesk } from "@/lib/store";
import { Composer } from "./Composer";
import { Logo } from "./Logo";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const d = useDesk();
  const [model, setModel] = useState(() => localStorage.getItem("fcc.model") || "");
  const [effort, setEffort] = useState<string | null>(() => localStorage.getItem("fcc.effort") || null);
  const [cwd, setCwd] = useState(() => localStorage.getItem("fcc.cwd") || "");
  const name = localStorage.getItem("fcc.name") || "";
  useEffect(() => {
    const ids = d.boot?.models.map((m) => m.id) ?? [];
    if (d.boot && (!model || !ids.includes(model))) setModel(d.boot.default_model);
  }, [d.boot]);
  useEffect(() => { if (model) localStorage.setItem("fcc.model", model); }, [model]);
  useEffect(() => { effort ? localStorage.setItem("fcc.effort", effort) : localStorage.removeItem("fcc.effort"); }, [effort]);
  useEffect(() => { localStorage.setItem("fcc.cwd", cwd); }, [cwd]);

  const unavailable = d.boot && !d.boot.available ? d.boot.message : null;
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-[12vh]">
      <div className="mb-7 flex items-center gap-3">
        <Logo size={34} />
        <h1 className="font-serif text-[40px] font-light leading-tight tracking-tight text-muted">{greeting()}{name ? `, ${name}` : ""}</h1>
      </div>
      <div className="w-full max-w-[720px]">
        <Composer big placeholder="How can I help you today?" model={model} effort={effort} onModel={setModel} onEffort={setEffort}
          cwd={cwd} onCwd={setCwd} disabled={!!unavailable}
          onSend={async (text) => {
            if (!cwd.trim()) { d.setError("Pick a project folder first. The agent works inside that folder."); return; }
            try { await d.startSession(cwd.trim(), text, model, effort); } catch (e: any) { d.setError(e.message); throw e; }
          }} />
        {unavailable && <p className="mt-3 rounded-ctl border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn">{unavailable}</p>}
        <p className="mt-3 text-center text-[12px] text-subtle">Chats run through your local FCC server with your own provider keys.</p>
      </div>
    </div>
  );
}
