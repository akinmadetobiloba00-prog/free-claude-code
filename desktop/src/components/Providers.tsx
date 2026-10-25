// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ExternalLink, Check, Search } from "lucide-react";
import { useDesk } from "@/lib/store";
import { admin, getPort, health, type ConfigField, type ProviderStatus } from "@/lib/api";
import { openExternal } from "@/lib/native";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dot } from "./Logo";
import { ModelPicker } from "./ModelPicker";

const GROUPS: { kind: string; label: string }[] = [
  { kind: "remote", label: "Cloud providers (API key)" },
  { kind: "connected_account", label: "Account sign-in" },
  { kind: "local", label: "Local model servers" },
];

export function Providers() {
  const d = useDesk();
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [open, setOpen] = useState<ProviderStatus | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const load = async () => { const c = await admin.config(); setFields(c.fields); await d.refreshStatus(); };
  useEffect(() => { load().catch((e) => d.setError(e.message)); }, []);
  const runtime = d.status?.startup?.providers ?? {};
  const list = useMemo(() => (d.status?.provider_status ?? []).filter((p) => !q || p.display_name.toLowerCase().includes(q.toLowerCase())), [d.status, q]);
  const ready = list.filter((p) => health(p.status, runtime[p.provider_id]) === "ok").length;

  const refreshModels = async () => {
    setBusy(true); setNote(null);
    try { await admin.refreshModels(); await Promise.all([d.refreshBoot(), d.refreshStatus()]); setNote("Model list refreshed."); }
    catch (e: any) { d.setError(e.message); } finally { setBusy(false); }
  };
  const setDefault = async (id: string) => {
    try { const r = await admin.apply({ MODEL: id }); if (r && r.applied === false) throw new Error((r.errors || []).join("; ") || "Not applied"); await Promise.all([d.refreshStatus(), d.refreshBoot()]); setNote(`Default model set to ${id}`); }
    catch (e: any) { d.setError(e.message); }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-6 py-8">
        <h1 className="font-serif text-[32px] font-light">Providers & models</h1>
        <p className="mt-1 text-sm text-muted">Keys are saved in your normal FCC config, so the terminal launchers (fcc-claude, fcc-codex…) use them too.</p>

        <section className="mt-6 rounded-card border border-line bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] uppercase tracking-wide text-subtle">Default model (MODEL)</div>
              <div className="mt-1 truncate font-mono text-[13px]">{d.status?.model ?? "—"}</div>
            </div>
            <ModelPicker value={d.status?.model ?? ""} onChange={setDefault} />
            <Button size="sm" onClick={refreshModels} disabled={busy}><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Refresh models</Button>
          </div>
          {note && <div className="mt-2 flex items-center gap-1 text-[13px] text-ok"><Check size={13} /> {note}</div>}
        </section>

        <div className="mt-6 flex items-center gap-3">
          <div className="relative flex-1"><Search size={14} className="absolute left-2.5 top-2 text-subtle" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search providers" className="pl-8" /></div>
          <span className="text-[13px] text-muted">{ready} ready</span>
        </div>

        {GROUPS.map((g) => {
          const ps = list.filter((p) => p.kind === g.kind);
          if (!ps.length) return null;
          return (
            <section key={g.kind} className="mt-6">
              <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-subtle">{g.label}</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ps.map((p) => (
                  <button key={p.provider_id} onClick={() => setOpen(p)} className="flex items-center gap-3 rounded-card border border-line bg-card px-3 py-2.5 text-left hover:border-[color-mix(in_oklab,var(--accent)_40%,var(--line))]">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-ctl bg-raised font-mono text-[11px] font-semibold text-muted">{p.display_name.slice(0, 2)}</span>
                    <span className="flex-1 truncate text-sm">{p.display_name}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted"><Dot state={health(p.status, runtime[p.provider_id])} /> {runtime[p.provider_id] === "failed" ? "Error" : p.label}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {open && <ProviderDialog p={open} fields={fields} onClose={() => setOpen(null)} onSaved={async () => { await load(); await refreshModels(); }} />}
    </div>
  );
}

function ProviderDialog({ p, fields, onClose, onSaved }: { p: ProviderStatus; fields: ConfigField[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const d = useDesk();
  const keys = fields.filter((f) => p.configuration_keys.includes(f.key) || (f.section === "providers" && f.key.startsWith(p.provider_id.toUpperCase())));
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const runtimeErr = d.status?.startup?.provider_errors?.[p.provider_id];

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const out: Record<string, unknown> = {};
      for (const f of keys) {
        const v = (values[f.key] ?? "").trim();
        if (!v) continue;
        if (f.type === "api_key_list") {
          // Add the new key first and keep existing saved keys (they are never sent back to us in clear).
          const existing = (f.value?.entries || []).map((e: any) => ({ retain: e.reference }));
          out[f.key] = { revision: f.value?.revision ?? null, entries: [{ value: v }, ...existing] };
        } else out[f.key] = v;
      }
      if (!Object.keys(out).length) { setMsg({ ok: false, text: "Nothing to save." }); return; }
      const r = await admin.apply(out);
      if (r && r.applied === false) {
        const checks = (r.credential_checks || []).map((c: any) => c.message).filter(Boolean);
        throw new Error(checks.join("; ") || (r.errors || []).join("; ") || "Not applied");
      }
      setValues({});
      setMsg({ ok: true, text: "Saved. Refreshing models…" });
      await onSaved();
      setMsg({ ok: true, text: "Saved and models refreshed." });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try { const r = await admin.test(p.provider_id); const ok = !!r?.ok; setMsg({ ok, text: ok ? `Connection works. ${(r.models || []).length} models found.` : r?.message || "Test failed." }); await d.refreshStatus(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={p.display_name}>
      <div className="mb-3 flex items-center gap-2 text-[13px] text-muted"><Dot state={health(p.status, d.status?.startup?.providers?.[p.provider_id])} /> {p.label}
        {p.website_url && <button className="ml-auto inline-flex items-center gap-1 text-accent hover:underline" onClick={() => openExternal(p.website_url)}>Get a key <ExternalLink size={12} /></button>}
      </div>
      {runtimeErr && <p className="mb-3 rounded-ctl bg-bad/10 px-2.5 py-2 text-[13px] text-bad">{runtimeErr}</p>}
      {p.kind === "connected_account" ? (
        <p className="text-sm text-muted">This provider uses an account sign-in. Open the full FCC Admin to connect it, then come back.
          <Button className="mt-3" size="sm" onClick={() => openExternal(`http://127.0.0.1:${getPort()}/admin`)}>Open FCC Admin <ExternalLink size={12} /></Button></p>
      ) : (
        <div className="space-y-3">
          {keys.length === 0 && <p className="text-sm text-muted">No settings for this provider.</p>}
          {keys.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[13px] font-medium">{f.label}</span>
              <span className="ml-2 text-[12px] text-subtle">{f.type === "api_key_list" ? `${(f.value?.entries || []).length} saved` : f.configured ? "set" : ""}</span>
              <Input className="mt-1" type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false}
                placeholder={f.type === "api_key_list" ? "Paste a new key" : typeof f.value === "string" ? f.value : ""}
                value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
      )}
      {msg && <p className={`mt-3 text-[13px] ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={test} disabled={busy}>Test</Button>
        {p.kind !== "connected_account" && <Button variant="primary" onClick={save} disabled={busy}>Save</Button>}
      </div>
    </Dialog>
  );
}
