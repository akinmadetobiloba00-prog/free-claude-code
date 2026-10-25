// SPDX-License-Identifier: AGPL-3.0-only
// App state: server readiness, model catalog, sessions, the open session and the live event feed.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { admin, code, getPort, type AdminStatus, type Bootstrap, type Detail, type Item, type Prompt, type Run, type Session } from "./api";
import { ensureServer } from "./native";

type Phase = "connecting" | "ready" | "error";
export type View = "chat" | "providers" | "tools" | "settings";

interface Live { items: Map<string, Item>; prompts: Map<string, Prompt>; run: Run | null; notice: string | null }

interface Desk {
  phase: Phase; phaseMessage: string; retry: () => void;
  boot: Bootstrap | null; status: AdminStatus | null; refreshStatus: () => Promise<void>; refreshBoot: () => Promise<void>;
  sessions: Session[]; search: string; setSearch: (s: string) => void; reloadSessions: () => Promise<void>;
  pins: string[]; togglePin: (id: string) => void;
  selected: Session | null; select: (id: string | null) => void; live: Live;
  view: View; setView: (v: View) => void;
  startSession: (cwd: string, text: string, model: string, effort: string | null) => Promise<void>;
  send: (text: string) => Promise<void>; stop: () => Promise<void>;
  patch: (s: Session, p: Partial<Pick<Session, "title" | "model" | "reasoning_effort" | "mode">>) => Promise<Session>;
  remove: (s: Session) => Promise<void>;
  error: string | null; setError: (e: string | null) => void;
}

const Ctx = createContext<Desk | null>(null);
export const useDesk = () => { const c = useContext(Ctx); if (!c) throw new Error("no desk"); return c; };
const emptyLive = (): Live => ({ items: new Map(), prompts: new Map(), run: null, notice: null });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DeskProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [phaseMessage, setPhaseMessage] = useState("Connecting to FCC…");
  const [attempt, setAttempt] = useState(0);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState("");
  const [pins, setPins] = useState<string[]>(() => JSON.parse(localStorage.getItem("fcc.pins") || "[]"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<Live>(emptyLive);
  const [view, setView] = useState<View>("chat");
  const [error, setError] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;

  const refreshStatus = useCallback(async () => { setStatus(await admin.status()); }, []);
  const refreshBoot = useCallback(async () => { setBoot(await code.bootstrap()); }, []);
  const reloadSessions = useCallback(async () => {
    const page = await code.list(search);
    setSessions((prev) => {
      // Keep pinned sessions visible even when they fall off the first page.
      const map = new Map(page.sessions.map((s) => [s.id, s]));
      for (const s of prev) if (pins.includes(s.id) && !map.has(s.id) && !search) map.set(s.id, s);
      return [...map.values()];
    });
  }, [search, pins]);

  // 1) Make sure fcc-server is up (starting it from the desktop shell when needed).
  useEffect(() => {
    let dead = false;
    (async () => {
      setPhase("connecting"); setPhaseMessage("Starting FCC…");
      try {
        const st = await ensureServer(getPort());
        if (!st.running) throw new Error(st.message);
        await Promise.all([refreshStatus(), refreshBoot()]);
        if (!dead) setPhase("ready");
      } catch (e) { if (!dead) { setPhase("error"); setPhaseMessage(msg(e)); } }
    })();
    return () => { dead = true; };
  }, [attempt, refreshStatus, refreshBoot]);

  useEffect(() => { if (phase === "ready") reloadSessions().catch((e) => setError(msg(e))); }, [phase, reloadSessions]);
  // Code sessions can still be starting right after fcc-server boots: re-check until available.
  useEffect(() => { if (phase !== "ready" || !boot || boot.available) return; const t = setTimeout(() => refreshBoot().catch(() => {}), 2000); return () => clearTimeout(t); }, [phase, boot, refreshBoot]);
  useEffect(() => { if (phase !== "ready") return; const t = setInterval(() => refreshStatus().catch(() => {}), 15000); return () => clearInterval(t); }, [phase, refreshStatus]);

  // 2) Live feed (SSE). Updates session list, items, runs and prompts in place.
  useEffect(() => {
    if (phase !== "ready") return;
    let es: EventSource | null = null; let timer: number | undefined; let closed = false;
    const upsertSession = (s: Session) => setSessions((prev) => { const i = prev.findIndex((x) => x.id === s.id); if (i < 0) return [s, ...prev]; const n = [...prev]; n[i] = s; return n; });
    const open = () => {
      es = code.events();
      const on = (type: string, fn: (d: any) => void) => es!.addEventListener(type, (ev) => { try { fn(JSON.parse((ev as MessageEvent).data)); } catch { /* ignore malformed frame */ } });
      on("session.updated", (d) => d.session && upsertSession(d.session));
      on("session.deleted", (d) => { setSessions((p) => p.filter((s) => s.id !== d.session_id)); if (selRef.current === d.session_id) setSelectedId(null); });
      on("run.updated", (d) => { if (d.run?.session_id === selRef.current) setLive((l) => ({ ...l, run: d.run })); });
      on("item.updated", (d) => { const it: Item | undefined = d.item; if (it && it.session_id === selRef.current) setLive((l) => { const m = new Map(l.items); m.set(it.id, it); return { ...l, items: m }; }); });
      on("prompt.updated", (d) => { const p: Prompt | undefined = d.prompt; if (p && p.session_id === selRef.current) setLive((l) => { const m = new Map(l.prompts); m.set(p.id, p); return { ...l, prompts: m }; }); });
      on("session.notice", (d) => { if (d.session_id === selRef.current) setLive((l) => ({ ...l, notice: d.message ?? null })); });
      on("feed.resync_required", () => { es?.close(); if (!closed) timer = window.setTimeout(open, 500); });
      es.onerror = () => { es?.close(); if (!closed) timer = window.setTimeout(open, 2000); };
    };
    open();
    return () => { closed = true; es?.close(); clearTimeout(timer); };
  }, [phase]);

  // 3) Loading the selected session's transcript.
  const loadDetail = useCallback(async (id: string) => {
    const d: Detail = await code.detail(id);
    if (selRef.current !== id) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? d.session : s)));
    setLive({ items: new Map(d.items.map((i) => [i.id, i])), prompts: new Map(d.prompts.map((p) => [p.id, p])), run: d.run, notice: null });
  }, []);
  const select = useCallback((id: string | null) => {
    setSelectedId(id); setLive(emptyLive()); setView("chat");
    if (id) loadDetail(id).catch((e) => setError(msg(e)));
  }, [loadDetail]);

  const selected = useMemo(() => sessions.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);
  const togglePin = (id: string) => setPins((p) => { const n = p.includes(id) ? p.filter((x) => x !== id) : [id, ...p]; localStorage.setItem("fcc.pins", JSON.stringify(n)); return n; });

  const patch = useCallback(async (s: Session, p: Partial<Pick<Session, "title" | "model" | "reasoning_effort" | "mode">>) => {
    const fresh = sessions.find((x) => x.id === s.id) ?? s;
    const out = await code.update(fresh, p);
    setSessions((prev) => prev.map((x) => (x.id === out.id ? out : x)));
    return out;
  }, [sessions]);

  const epoch = () => boot?.epoch ?? "";
  const sendTo = useCallback(async (s: Session, text: string) => {
    try { await code.send(s, epoch(), text); }
    catch (e) {
      // Epoch or revision moved (server restart / settings change): refresh once and retry.
      const b = await code.bootstrap(); setBoot(b);
      const d = await code.detail(s.id);
      await code.send(d.session, b.epoch, text);
    }
  }, [boot]);

  const startSession = useCallback(async (cwd: string, text: string, model: string, effort: string | null) => {
    let s = await code.create(cwd);
    if (model !== s.model || (effort ?? null) !== (s.reasoning_effort ?? null)) s = await code.update(s, { model, reasoning_effort: effort });
    setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
    setSelectedId(s.id); setLive(emptyLive()); setView("chat");
    await sendTo(s, text);
    loadDetail(s.id).catch(() => {});
  }, [sendTo, loadDetail]);

  const send = useCallback(async (text: string) => {
    if (!selected) return;
    await sendTo(selected, text);
  }, [selected, sendTo]);
  const stop = useCallback(async () => { if (selected) await code.stop(selected); }, [selected]);
  const remove = useCallback(async (s: Session) => { await code.remove(s); setSessions((p) => p.filter((x) => x.id !== s.id)); if (selectedId === s.id) select(null); }, [selectedId, select]);

  const value: Desk = {
    phase, phaseMessage, retry: () => setAttempt((a) => a + 1), boot, status, refreshStatus, refreshBoot,
    sessions, search, setSearch, reloadSessions, pins, togglePin, selected, select, live, view, setView,
    startSession, send, stop, patch, remove, error, setError,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
