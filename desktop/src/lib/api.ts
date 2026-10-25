// SPDX-License-Identifier: AGPL-3.0-only
// Typed client for the local FCC Admin + code-session API (src/free_claude_code/api).

export const getPort = () => Number(localStorage.getItem("fcc.port") || 8082);
// Always same-origin: Vite proxies in dev, the Rust bridge (src-tauri/src/proxy.rs) in the app.
export const baseUrl = () => "";

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

/** Parse a response body as JSON without ever throwing (empty, HTML or plain-text bodies give null). */
export function parseBody(text: string): any {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      ...init,
      headers: init.body ? { "content-type": "application/json", ...(init.headers || {}) } : init.headers,
    });
  } catch (e) {
    throw new ApiError(`Could not reach FCC (${e instanceof Error ? e.message : String(e)})`, 0);
  }
  let text = "";
  try { text = await res.text(); } catch { /* body unreadable */ }
  const data = parseBody(text);
  if (!res.ok) {
    const d = data?.detail ?? data?.error ?? data?.message;
    const plain = data === null && text && text.length < 200 && !/^\s*</.test(text) ? text.trim() : "";
    const msg = typeof d === "string" ? d : d ? JSON.stringify(d) : plain ? `${plain} (${res.status})` : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  if (text && data === null) throw new ApiError("FCC returned a response that is not JSON.", res.status);
  return data as T;
}

export type Mode = "config" | "ask" | "auto_review" | "full_access";
export interface Session {
  id: string; cwd: string; model: string; reasoning_effort: string | null; mode: Mode;
  title: string; revision: number; status: string; error: string | null;
  context_used_tokens: number | null; created_at: number; updated_at: number;
  provider_id: string; model_name: string;
}
export interface Run { id: string; session_id: string; status: string; error: string | null; text: string; ordinal: number }
export interface Item { id: string; session_id: string; sequence: number; run_id: string; kind: string; title: string; text: string; detail: string; complete: boolean; html: string | null }
export interface Prompt { id: string; session_id: string; kind: string; form: Record<string, any>; status: string; error: string | null }
export interface CodeModel { id: string; display_name: string; provider_id: string; model_name: string; reasoning_efforts: string[]; default_reasoning_effort: string | null }
export interface Bootstrap { available: boolean; message: string | null; epoch: string; models: CodeModel[]; default_model: string }
export interface Detail { session: Session; run: Run | null; runs: Run[]; items: Item[]; prompts: Prompt[]; active_prompt_ids: string[]; epoch: string }
export interface ProviderStatus {
  provider_id: string; display_name: string; website_url: string; logo_filename: string | null;
  kind: string; status: string; label: string; configuration_keys: string[]; missing_configuration_keys: string[];
}
export interface AdminStatus { status: string; startup?: { providers?: Record<string, string>; provider_errors?: Record<string, string> }; port: number; model: string; provider: string; provider_status: ProviderStatus[] }
export interface ConfigField { key: string; label: string; section: string; type: string; value: any; configured: boolean; secret: boolean; description: string; options: { value: string; label: string }[] }

/** Which session API the running fcc-server speaks. "code" = v6.10+, "chat" = older Chat Sessions, "none" = neither. */
export type Flavour = "code" | "chat" | "none";
export interface Features { folders: boolean; prompts: boolean; modes: boolean; rename: boolean }

/** Callbacks the live feed drives. Everything is scoped by session id; the store filters to the open one. */
export interface FeedHandlers {
  upsertSession: (s: Session) => void;
  deleteSession: (id: string) => void;
  run: (sessionId: string, run: Run) => void;
  item: (item: Item) => void;
  prompt: (p: Prompt) => void;
  notice: (sessionId: string, message: string | null) => void;
  /** Ask the store to reload a session's transcript from the server. */
  reload: (sessionId: string) => void;
}

export interface SessionClient {
  flavour: Exclude<Flavour, "none">;
  features: Features;
  bootstrap: () => Promise<Bootstrap>;
  list: (query?: string) => Promise<{ sessions: Session[] }>;
  create: (cwd: string) => Promise<Session>;
  detail: (id: string) => Promise<Detail>;
  update: (s: Session, patch: Partial<Pick<Session, "title" | "model" | "reasoning_effort" | "mode">>) => Promise<Session>;
  remove: (s: Session) => Promise<unknown>;
  send: (s: Session, epoch: string, text: string) => Promise<unknown>;
  stop: (s: Session) => Promise<unknown>;
  answer: (s: Session, p: Prompt, answer: Record<string, unknown>) => Promise<unknown>;
  pickFolder: (initial?: string) => Promise<{ path: string | null }>;
  /** Open the live feed; returns a function that closes it. */
  subscribe: (h: FeedHandlers) => () => void;
}

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Shared SSE wiring: reconnects on error / resync and never throws on a malformed frame. */
function feed(url: string, wire: (on: (type: string, fn: (d: any) => void) => void, restart: () => void) => void): () => void {
  let es: EventSource | null = null; let timer: number | undefined; let closed = false;
  const reopen = (ms: number) => { es?.close(); if (!closed) { clearTimeout(timer); timer = window.setTimeout(open, ms); } };
  function open() {
    try { es = new EventSource(`${baseUrl()}${url}`); } catch { reopen(3000); return; }
    const src = es;
    const on = (type: string, fn: (d: any) => void) => src.addEventListener(type, (ev) => {
      const d = parseBody((ev as MessageEvent).data ?? ""); if (d) { try { fn(d); } catch { /* ignore bad frame */ } }
    });
    wire(on, () => reopen(500));
    src.onerror = () => reopen(2000);
  }
  open();
  return () => { closed = true; es?.close(); clearTimeout(timer); };
}

// ---------- v6.10+ Code sessions (/admin/api/code) ----------
const C = "/admin/api/code";
export const codeClient: SessionClient = {
  flavour: "code",
  features: { folders: true, prompts: true, modes: true, rename: true },
  bootstrap: () => api<Bootstrap>(`${C}/bootstrap`),
  list: (query = "") => api<{ sessions: Session[] }>(`${C}/sessions?limit=25&query=${encodeURIComponent(query)}`),
  create: (cwd: string) => api<Session>(`${C}/sessions`, { method: "POST", body: JSON.stringify({ session_id: uuid(), cwd, harness: "codex" }) }),
  detail: (id: string) => api<Detail>(`${C}/sessions/${id}`),
  update: (s, patch) => api<Session>(`${C}/sessions/${s.id}`, { method: "PATCH", body: JSON.stringify({ expected_revision: s.revision, mode: s.mode, ...patch }) }),
  remove: (s) => api(`${C}/sessions/${s.id}?expected_revision=${s.revision}`, { method: "DELETE" }),
  send: (s, epoch, text) => api<Run>(`${C}/sessions/${s.id}/turns`, { method: "POST", body: JSON.stringify({ operation_id: uuid(), expected_revision: s.revision, expected_epoch: epoch, text }) }),
  stop: (s) => api<Run>(`${C}/sessions/${s.id}/stop`, { method: "POST", body: JSON.stringify({ operation_id: uuid() }) }),
  answer: (s, p, answer) => api(`${C}/sessions/${s.id}/prompts/${p.id}/responses`, { method: "POST", body: JSON.stringify({ response_id: uuid(), answer }) }),
  pickFolder: (initial) => api<{ path: string | null }>(`${C}/folder-picker`, { method: "POST", body: JSON.stringify({ initial_path: initial || null }) }),
  subscribe: (h) => feed(`${C}/events`, (on, restart) => {
    on("session.updated", (d) => d.session && h.upsertSession(d.session));
    on("session.deleted", (d) => d.session_id && h.deleteSession(d.session_id));
    on("run.updated", (d) => d.run?.session_id && h.run(d.run.session_id, d.run));
    on("item.updated", (d) => d.item && h.item(d.item));
    on("prompt.updated", (d) => d.prompt && h.prompt(d.prompt));
    on("session.notice", (d) => d.session_id && h.notice(d.session_id, d.message ?? null));
    on("feed.resync_required", restart);
  }),
};

// ---------- Older Chat Sessions (/admin/api/chat, fcc up to v6.9.x) ----------
// Shapes from upstream src/free_claude_code/api/chat_routes.py before "Remove Chat Sessions" (#1710).
const H = "/admin/api/chat";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
interface ChatSessionJson { id?: string; session_id?: string; title?: string; model?: string; reasoning?: string; revision?: number; created_at?: number; updated_at?: number; preview?: string }
interface ChatSegmentJson { ordinal: number; kind: string; text: string; html?: string }
interface ChatTurnJson { id: string; session_id: string; sequence: number; user_text: string; generation?: { id: string; status: string; error_message?: string | null; segments?: ChatSegmentJson[] } }

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const plainHtml = (t: string) => `<p>${esc(t).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
const splitModel = (ref: string) => { const i = ref.indexOf("/"); return i < 0 ? ["", ref] : [ref.slice(0, i), ref.slice(i + 1)]; };

export function chatSession(j: ChatSessionJson): Session {
  const id = j.id ?? j.session_id ?? "";
  const model = j.model ?? "";
  const [provider_id, model_name] = splitModel(model);
  return {
    id, cwd: "", model, reasoning_effort: !j.reasoning || j.reasoning === "off" ? null : j.reasoning, mode: "config",
    title: j.title || "New chat", revision: j.revision ?? 1, status: "idle", error: null, context_used_tokens: null,
    created_at: j.created_at ?? 0, updated_at: j.updated_at ?? 0, provider_id, model_name,
  };
}

const runStatus = (s: string) => (s === "running" ? "running" : s === "completed" ? "completed" : s === "stopped" || s === "interrupted" ? "stopped" : s === "failed" ? "failed" : s);

export function chatDetail(j: { session: ChatSessionJson; turns?: ChatTurnJson[] }): Detail {
  const session = chatSession(j.session);
  const items: Item[] = []; const runs: Run[] = [];
  for (const t of j.turns ?? []) {
    const base = t.sequence * 1000;
    const g = t.generation;
    items.push({ id: `turn:${t.id}`, session_id: session.id, sequence: base, run_id: g?.id ?? t.id, kind: "user", title: "", text: t.user_text, detail: "", complete: true, html: null });
    // Segments of a still-running generation stream in over the feed; skip them here to avoid duplicates.
    for (const seg of g && g.status !== "running" ? g.segments ?? [] : []) {
      const reasoning = seg.kind === "thinking";
      items.push({ id: `gen:${g!.id}:${seg.ordinal}`, session_id: session.id, sequence: base + 1 + seg.ordinal, run_id: g!.id, kind: reasoning ? "reasoning" : "text", title: "", text: seg.text, detail: "", complete: g!.status !== "running", html: seg.html ?? plainHtml(seg.text) });
    }
    if (g) runs.push({ id: g.id, session_id: session.id, status: runStatus(g.status), error: g.error_message ?? null, text: "", ordinal: t.sequence });
  }
  return { session, run: runs[runs.length - 1] ?? null, runs, items, prompts: [], active_prompt_ids: [], epoch: "" };
}

/** Operation currently running per chat session: the old API needs its id to stop it. */
const activeOps = new Map<string, string>();

export const chatClient: SessionClient = {
  flavour: "chat",
  features: { folders: false, prompts: false, modes: false, rename: true },
  bootstrap: async () => {
    const j = await api<any>(`${H}/bootstrap`);
    const models: CodeModel[] = (Array.isArray(j?.models) ? j.models : []).map((m: any) => ({
      id: m.model_ref, display_name: m.model_ref, provider_id: m.provider_id ?? splitModel(m.model_ref)[0], model_name: m.model_id ?? splitModel(m.model_ref)[1],
      reasoning_efforts: m.supports_reasoning ? EFFORTS : [], default_reasoning_effort: null,
    }));
    return { available: j?.available !== false, message: j?.message ?? null, epoch: "", models, default_model: j?.preferences?.last_model || models[0]?.id || "" };
  },
  list: async (query = "") => {
    const j = await api<any>(`${H}/sessions?limit=25&query=${encodeURIComponent(query)}`);
    return { sessions: (j?.sessions ?? []).map(chatSession) };
  },
  create: async () => chatSession(await api<ChatSessionJson>(`${H}/sessions`, { method: "POST" })),
  detail: async (id) => chatDetail(await api<any>(`${H}/sessions/${id}`)),
  update: async (s, patch) => {
    const body: Record<string, unknown> = { expected_revision: s.revision };
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.model !== undefined) body.model = patch.model;
    if (patch.reasoning_effort !== undefined) body.reasoning = patch.reasoning_effort ?? "off";
    if (Object.keys(body).length === 1) return s; // nothing the old API can change (e.g. mode)
    return chatSession(await api<ChatSessionJson>(`${H}/sessions/${s.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  },
  remove: (s) => api(`${H}/sessions/${s.id}`, { method: "DELETE", body: JSON.stringify({ expected_revision: s.revision }) }),
  send: async (s, _epoch, text) => {
    const operation_id = uuid();
    activeOps.set(s.id, operation_id);
    return api(`${H}/sessions/${s.id}/send`, { method: "POST", body: JSON.stringify({ expected_revision: s.revision, operation_id, text }) });
  },
  stop: async (s) => {
    const operation_id = activeOps.get(s.id);
    if (!operation_id) throw new ApiError("Nothing to stop: no running reply was found for this chat.", 409);
    return api(`${H}/sessions/${s.id}/stop`, { method: "POST", body: JSON.stringify({ operation_id }) });
  },
  answer: async () => { throw new ApiError("Approvals are not supported by this fcc version.", 501); },
  pickFolder: async () => ({ path: null }),
  subscribe: (h) => feed(`${H}/events`, (on, restart) => {
    const running = (sid: string, op: string) => h.run(sid, { id: op, session_id: sid, status: "running", error: null, text: "", ordinal: 0 });
    on("feed.ready", (d) => {
      for (const a of d.active_operations ?? []) if (a?.session_id && a.operation_id) { activeOps.set(a.session_id, a.operation_id); running(a.session_id, a.operation_id); }
    });
    on("session.created", (d) => h.upsertSession(chatSession(d)));
    on("session.updated", (d) => h.upsertSession(chatSession(d)));
    on("session.deleted", (d) => d.session_id && h.deleteSession(d.session_id));
    on("operation.started", (d) => { if (d.session_id && d.operation_id) { activeOps.set(d.session_id, d.operation_id); running(d.session_id, d.operation_id); } });
    on("turn.started", (d) => { if (d.session_id) { if (d.operation_id) activeOps.set(d.session_id, d.operation_id); h.reload(d.session_id); } });
    const buf = new Map<string, string>();
    const seg = (d: any, delta: string, complete: boolean) => {
      if (!d.session_id || typeof d.ordinal !== "number") return;
      const id = `op:${d.operation_id}:${d.ordinal}`;
      const text = (buf.get(id) ?? "") + delta; buf.set(id, text);
      const reasoning = d.segment_kind === "thinking";
      h.item({ id, session_id: d.session_id, sequence: 1e12 + d.ordinal, run_id: d.operation_id, kind: reasoning ? "reasoning" : "text", title: "", text, detail: "", complete, html: plainHtml(text) });
    };
    on("segment.started", (d) => seg(d, "", false));
    on("segment.delta", (d) => seg(d, String(d.delta ?? ""), false));
    for (const t of ["turn.completed", "turn.failed", "turn.stopped", "operation.failed", "operation.completed"]) {
      on(t, (d) => { if (!d.session_id) return; for (const k of [...buf.keys()]) if (k.startsWith(`op:${d.operation_id}:`)) buf.delete(k); if (activeOps.get(d.session_id) === d.operation_id) activeOps.delete(d.session_id); h.reload(d.session_id); if (t !== "turn.completed" && d.message) h.notice(d.session_id, d.message); });
    }
    on("feed.resync_required", restart);
  }),
};

/** Boot-time detection: try the new code API, then the old chat API. Anything else = chat unavailable. */
export async function detectClient(): Promise<{ client: SessionClient | null; boot: Bootstrap | null; reason: string | null }> {
  const errors: string[] = [];
  for (const c of [codeClient, chatClient]) {
    try { return { client: c, boot: await c.bootstrap(), reason: null }; }
    catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      errors.push(`${c.flavour}: ${e instanceof Error ? e.message : String(e)}`);
      // 404/405 = route missing on this version; keep probing. Other errors also fall through to the next flavour.
      if (status === 0) break; // server unreachable: no point probing further
    }
  }
  return { client: null, boot: null, reason: errors.join("; ") };
}

/** Kept for components that call the client directly; resolves to whichever flavour was detected. */
let current: SessionClient = codeClient;
export const setClient = (c: SessionClient | null) => { current = c ?? codeClient; };
export const code = {
  answer: (s: Session, p: Prompt, a: Record<string, unknown>) => current.answer(s, p, a),
  pickFolder: (initial?: string) => current.pickFolder(initial),
};

export const admin = {
  /** fcc-server version: /admin/api/status if it reports one, else FastAPI's OpenAPI info (null when unknown). */
  version: async (): Promise<string | null> => {
    try { const o = await api<any>("/admin/api/status"); if (typeof o?.version === "string") return o.version; } catch { /* ignore */ }
    try { const o = await api<any>("/openapi.json"); return typeof o?.info?.version === "string" ? o.info.version : null; } catch { return null; }
  },
  status: () => api<AdminStatus>("/admin/api/status"),
  config: () => api<{ fields: ConfigField[]; provider_status: ProviderStatus[] }>("/admin/api/config"),
  apply: (values: Record<string, unknown>) => api<any>("/admin/api/config/apply", { method: "POST", body: JSON.stringify({ values }) }),
  test: (providerId: string) => api<any>(`/admin/api/providers/${providerId}/test`, { method: "POST" }),
  refreshModels: () => api<any>("/admin/api/models/refresh", { method: "POST" }),
};

/** Health dot for a provider: config status from /admin/api/status plus runtime startup state. */
export function health(configStatus: string | undefined, runtime?: string): "ok" | "warn" | "off" | "bad" {
  if (!configStatus || configStatus.startsWith("missing") || configStatus === "disconnected") return "off";
  if (runtime === "failed" || runtime === "error") return "bad";
  if (runtime === "starting") return "warn";
  if (runtime === "unavailable") return "off";
  return "ok";
}
