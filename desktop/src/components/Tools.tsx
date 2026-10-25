// SPDX-License-Identifier: AGPL-3.0-only
// Harnesses & CLI: every fcc-* command from pyproject.toml, launchable from the GUI.
import { useEffect, useState } from "react";
import { Play, Stethoscope, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { HARNESSES, listHarnesses, launchInTerminal, runCapture, openExternal, isTauri, type HarnessInfo } from "@/lib/native";
import { getPort } from "@/lib/api";
import { useDesk } from "@/lib/store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dot } from "./Logo";

export function Tools() {
  const d = useDesk();
  const [info, setInfo] = useState<HarnessInfo[] | null>(null);
  const [cwd, setCwd] = useState(() => localStorage.getItem("fcc.cwd") || "");
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const refresh = () => listHarnesses().then(setInfo).catch((e) => d.setError(String(e)));
  useEffect(() => { refresh(); }, []);
  const launch = async (cmd: string) => { try { await launchInTerminal(cmd, cwd); } catch (e: any) { d.setError(String(e?.message ?? e)); } };
  const capture = async (c: "version" | "doctor") => { setBusy(true); try { setOut(await runCapture(c)); } catch (e: any) { setOut(String(e?.message ?? e)); } finally { setBusy(false); } };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <h1 className="font-serif text-[32px] font-light">Harnesses & CLI</h1>
        <p className="mt-1 text-sm text-muted">FCC Desk shares the same fcc-server, keys and config as the terminal. Launch any harness here; it opens in a terminal window, exactly as if you typed the command.</p>
        {!isTauri() && <p className="mt-3 rounded-ctl bg-warn/10 px-3 py-2 text-[13px] text-warn">Browser preview: launching needs the desktop app. The commands are listed so you can copy them.</p>}
        <label className="mt-5 block text-[13px] text-muted">Working folder for launches
          <Input className="mt-1" value={cwd} onChange={(e) => { setCwd(e.target.value); localStorage.setItem("fcc.cwd", e.target.value); }} placeholder="C:\\Users\\you\\project" />
        </label>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {HARNESSES.map((h) => {
            const i = info?.find((x) => x.launcher === h.launcher);
            const state = !i ? "off" : i.launcher_found && i.binary_found ? "ok" : i.launcher_found ? "warn" : "bad";
            return (
              <div key={h.launcher} className="rounded-card border border-line bg-card p-3">
                <div className="flex items-center gap-2"><Dot state={state as any} /><span className="text-sm font-medium">{h.name}</span><code className="ml-auto font-mono text-[12px] text-subtle">{h.launcher}</code></div>
                <div className="mt-1 text-[12px] text-subtle">{!i ? "Status needs the desktop app" : i.binary_found ? `${h.binary} found` : `${h.binary} not installed: ${h.install}`}</div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="primary" disabled={!i?.launcher_found} onClick={() => launch(h.launcher)}><Play size={12} /> Launch</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(h.launcher)}><Copy size={12} /> Copy</Button>
                </div>
              </div>
            );
          })}
        </div>
        <h2 className="mt-8 text-[12px] font-medium uppercase tracking-wide text-subtle">Maintenance</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => capture("doctor")} disabled={busy}><Stethoscope size={13} /> Run fcc-doctor</Button>
          <Button size="sm" onClick={() => capture("version")} disabled={busy}>fcc-server --version</Button>
          <Button size="sm" onClick={() => launch("fcc-update")}><RefreshCw size={13} /> fcc-update (terminal)</Button>
          <Button size="sm" onClick={() => openExternal(`http://127.0.0.1:${getPort()}/admin`)}><ExternalLink size={13} /> Full Admin (integrations, messaging)</Button>
          <Button size="sm" variant="ghost" onClick={refresh}>Re-check installs</Button>
        </div>
        {out && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-card border border-line bg-sidebar p-3 font-mono text-[12px] text-muted">{out}</pre>}
      </div>
    </div>
  );
}
