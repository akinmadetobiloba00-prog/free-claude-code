// SPDX-License-Identifier: AGPL-3.0-only
// App state: server readiness, model catalog, sessions, the open session and the live event feed.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { admin, detectClient, getPort, setClient, type AdminStatus, type Bootstrap, type Detail, type Features, type Flavour, type Item, type Prompt, type Run, type Session, type SessionClient } from "./api";
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
  /** Session API spoken by this fcc-server ("none" = chat unavailable, rest of the app still works). */
  flavour: Flavour; features: Features; fccVersion: string | null;
  /** Shown instead of the chat UI when no session API was found. */
  chatUnavailable: string | null;
}

const Ctx = createContext<Desk | null>(null);
export const useDesk = () => { const c = useContext(Ctx); if (!c) throw new Error("no desk"); return c; };
const emptyLive = (): Live => ({ items: new Map(), prompts: new Map(), run: null, notice: null });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NO_FEATURES: Features = { folders: false, prompts: false, modes: false, rename: false };
export const UPGRADE_CMD = "uv tool upgrade free-claude-code";
export function tooOldMessage(version: string | null) {
  return `Your fcc version${version ? ` (${version})` : ""} does not provide a chat API FCC Desk understands. Run: ${UPGRADE_CMD} — then restart fcc-server. Harnesses, Providers and Settings still work.`;
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [phaseMessage, setPhaseMessage] = useState("Connecting to FCC…");
  const [attempt, setAttempt] = useState(0);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState("");
  const [pins, setPins] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem("fcc.pins") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } });
  const [client, setClientState] = useState<SessionClient | null>(null);
  const [fccVersion, setFccVersion] = useState<string | null>(null);
  const [chatUnavailable, setChatUnavailable] = useState<string | null>(null);
  const clientRef = useRef<SessionClient | null>(null);
  clientRef.current = client;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<Live>(emptyLive);
  const [view, setView] = useState<View>("chat");
  const [error, setError] = useState<string | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selectedId;

  const refreshStatus = useCallback(async () => { setStatus(await admin.status()); }, []);
  const refreshBoot = useCallback(async () => { const c = clientRef.current; if (c) setBoot(await c.bootstrap()); }, []);
  const need = () => { const c = clientRef.current; if (!c) throw new Error(chatUnavailableRef.current ?? "Chat is not available on this fcc version."); return c; };
  const chatUnavailableRef = useRef<string | null>(null);
  chatUnavailableRef.current = chatUnavailable;
  const reloadSessions = useCallback(async () => {
    const c = clientRef.current; if (!c) { setSessions([]); return; }
    const page = await c.list(search);
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
        // Only reachability is fatal. Status, version and chat detection degrade gracefully.
        const [, version, det] = await Promise.all([
          refreshStatus().catch(() => {}),
          admin.version().catch(() => null),
          detectClient(),
        ]);
        if (dead) return;
        setFccVersion(version);
        setClient(det.client); clientRef.current = det.client; setClientState(det.client);
        setBoot(det.boot);
        setChatUnavailable(det.client ? null : tooOldMessage(version));
        if (!dead) setPhase("ready");
      } catch (e) { if (!dead) { setPhase("error"); setPhaseMessage(msg(e)); } }
    })();
    return () => { dead = true; };
  }, [attempt, refreshStatus]);

  useEffect(() => { if (phase === "ready") reloadSessions().catch((e) => setError(msg(e))); }, [phase, reloadSessions]);
  // Code sessions can still be starting right after fcc-server boots: re-check until available.
  useEffect(() => { if (phase !== "ready" || !client || !boot || boot.available) return; const t = setTimeout(() => refreshBoot().catch(() => {}), 2000); return () => clearTimeout(t); }, [phase, client, boot, refreshBoot]);
  useEffect(() => { if (phase !== "ready") return; const t = setInterval(() => refreshStatus().catch(() => {}), 15000); return () => clearInterval(t); }, [phase, refreshStatus]);

  // 2) Live feed (SSE). Updates session list, items, runs and prompts in place.
  const reloadTimers = useRef(new Map<string, number>());
  useEffect(() => {
    if (phase !== "ready" || !client) return;
    const upsertSession = (s: Session) => s.id && setSessions((prev) => { const i = prev.findIndex((x) => x.id === s.id); if (i < 0) return [s, ...prev]; const n = [...prev]; n[i] = { ...prev[i], ...s, cwd: s.cwd || prev[i].cwd }; return n; });
    const close = client.subscribe({
      upsertSession,
      deleteSession: (id) => { setSessions((p) => p.filter((s) => s.id !== id)); if (selRef.current === id) setSelectedId(null); },
      run: (sid, run) => { if (sid === selRef.current) setLive((l) => ({ ...l, run })); },
      item: (it: Item) => { if (it.session_id === selRef.current) setLive((l) => { const m = new Map(l.items); m.set(it.id, it); return { ...l, items: m }; }); },
      prompt: (p: Prompt) => { if (p.session_id === selRef.current) setLive((l) => { const m = new Map(l.prompts); m.set(p.id, p); return { ...l, prompts: m }; }); },
      notice: (sid, message) => { if (sid === selRef.current) setLive((l) => ({ ...l, notice: message })); },
      reload: (sid) => {
        if (sid !== selRef.current) return;
        clearTimeout(reloadTimers.current.get(sid));
        reloadTimers.current.set(sid, window.setTimeout(() => { loadDetailRef.current(sid).catch(() => {}); }, 150));
      },
    });
    return () => { close(); for (const t of reloadTimers.current.values()) clearTimeout(t); reloadTimers.current.clear(); };
  }, [phase, client]);

  // 3) Loading the selected session's transcript.
  const loadDetail = useCallback(async (id: string) => {
    const d: Detail = await need().detail(id);
    if (selRef.current !== id) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...d.session, cwd: d.session.cwd || s.cwd } : s)));
    setLive({ items: new Map(d.items.map((i) => [i.id, i])), prompts: new Map(d.prompts.map((p) => [p.id, p])), run: d.run, notice: null });
  }, []);
  const loadDetailRef = useRef(loadDetail);
  loadDetailRef.current = loadDetail;
  const select = useCallback((id: string | null) => {
    setSelectedId(id); setLive(emptyLive()); setView("chat");
    if (id) loadDetail(id).catch((e) => setError(msg(e)));
  }, [loadDetail]);

  const selected = useMemo(() => sessions.find((s) => s.id === selectedId) ?? null, [sessions, selectedId]);
  const togglePin = (id: string) => setPins((p) => { const n = p.includes(id) ? p.filter((x) => x !== id) : [id, ...p]; try { localStorage.setItem("fcc.pins", JSON.stringify(n)); } catch { /* storage full */ } return n; });

  const patch = useCallback(async (s: Session, p: Partial<Pick<Session, "title" | "model" | "reasoning_effort" | "mode">>) => {
    const fresh = sessions.find((x) => x.id === s.id) ?? s;
    const out = await need().update(fresh, p);
    setSessions((prev) => prev.map((x) => (x.id === out.id ? out : x)));
    return out;
  }, [sessions, client]);

  const epoch = () => boot?.epoch ?? "";
  const sendTo = useCallback(async (s: Session, text: string) => {
    const c = need();
    try { await c.send(s, epoch(), text); }
    catch (e) {
      // Epoch or revision moved (server restart / settings change): refresh once and retry.
      const b = await c.bootstrap(); setBoot(b);
      const d = await c.detail(s.id);
      await c.send(d.session, b.epoch, text);
    }
  }, [boot, client]);

  const startSession = useCallback(async (cwd: string, text: string, model: string, effort: string | null) => {
    const c = need();
    let s = await c.create(cwd);
    if ((model && model !== s.model) || (effort ?? null) !== (s.reasoning_effort ?? null)) s = await c.update(s, { model: model || s.model, reasoning_effort: effort });
    setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
    setSelectedId(s.id); setLive(emptyLive()); setView("chat");
    await sendTo(s, text);
    loadDetail(s.id).catch(() => {});
  }, [sendTo, loadDetail, client]);

  const send = useCallback(async (text: string) => {
    if (!selected) return;
    await sendTo(selected, text);
  }, [selected, sendTo]);
  const stop = useCallback(async () => { if (selected) await need().stop(selected); }, [selected, client]);
  const remove = useCallback(async (s: Session) => { await need().remove(s); setSessions((p) => p.filter((x) => x.id !== s.id)); if (selectedId === s.id) select(null); }, [selectedId, select, client]);

  const value: Desk = {
    phase, phaseMessage, retry: () => setAttempt((a) => a + 1), boot, status, refreshStatus, refreshBoot,
    sessions, search, setSearch, reloadSessions, pins, togglePin, selected, select, live, view, setView,
    startSession, send, stop, patch, remove, error, setError,
    flavour: client?.flavour ?? "none", features: client?.features ?? NO_FEATURES, fccVersion, chatUnavailable,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
