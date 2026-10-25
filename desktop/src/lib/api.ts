// SPDX-License-Identifier: AGPL-3.0-only
// Typed client for the local FCC Admin + code-session API (src/free_claude_code/api).

export const getPort = () => Number(localStorage.getItem("fcc.port") || 8082);
// Always same-origin: Vite proxies in dev, the Rust bridge (src-tauri/src/proxy.rs) in the app.
export const baseUrl = () => "";

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(baseUrl() + path, {
    ...init,
    headers: init.body ? { "content-type": "application/json", ...(init.headers || {}) } : init.headers,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const d = data?.detail ?? data?.error ?? data?.message;
    const msg = typeof d === "string" ? d : d ? JSON.stringify(d) : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
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

const C = "/admin/api/code";
export const code = {
  bootstrap: () => api<Bootstrap>(`${C}/bootstrap`),
  list: (query = "") => api<{ sessions: Session[] }>(`${C}/sessions?limit=25&query=${encodeURIComponent(query)}`),
  create: (cwd: string) => api<Session>(`${C}/sessions`, { method: "POST", body: JSON.stringify({ session_id: crypto.randomUUID(), cwd, harness: "codex" }) }),
  detail: (id: string) => api<Detail>(`${C}/sessions/${id}`),
  update: (s: Session, patch: Partial<Pick<Session, "title" | "model" | "reasoning_effort" | "mode">>) =>
    api<Session>(`${C}/sessions/${s.id}`, { method: "PATCH", body: JSON.stringify({ expected_revision: s.revision, mode: s.mode, ...patch }) }),
  remove: (s: Session) => api(`${C}/sessions/${s.id}?expected_revision=${s.revision}`, { method: "DELETE" }),
  send: (s: Session, epoch: string, text: string) =>
    api<Run>(`${C}/sessions/${s.id}/turns`, { method: "POST", body: JSON.stringify({ operation_id: crypto.randomUUID(), expected_revision: s.revision, expected_epoch: epoch, text }) }),
  stop: (s: Session) => api<Run>(`${C}/sessions/${s.id}/stop`, { method: "POST", body: JSON.stringify({ operation_id: crypto.randomUUID() }) }),
  answer: (s: Session, p: Prompt, answer: Record<string, unknown>) =>
    api(`${C}/sessions/${s.id}/prompts/${p.id}/responses`, { method: "POST", body: JSON.stringify({ response_id: crypto.randomUUID(), answer }) }),
  pickFolder: (initial?: string) => api<{ path: string | null }>(`${C}/folder-picker`, { method: "POST", body: JSON.stringify({ initial_path: initial || null }) }),
  events: () => new EventSource(`${baseUrl()}${C}/events`),
};

export const admin = {
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
