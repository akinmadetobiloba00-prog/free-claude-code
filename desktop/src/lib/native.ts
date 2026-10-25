// SPDX-License-Identifier: AGPL-3.0-only
// Bridge to the Tauri shell. In a plain browser (Vite dev) these become no-ops.
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface ServerState { running: boolean; started_by_desk: boolean; message: string }

export async function ensureServer(port: number): Promise<ServerState> {
  if (!isTauri()) {
    const ok = await fetch("/health").then((r) => r.ok).catch(() => false);
    return { running: ok, started_by_desk: false, message: ok ? "FCC is running" : "FCC is not running. Start it with fcc-server." };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ServerState>("ensure_server", { port });
}

export async function openExternal(url: string) {
  if (!isTauri()) { window.open(url, "_blank"); return; }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export interface HarnessInfo { launcher: string; binary: string; launcher_found: boolean; binary_found: boolean }

/** Every FCC CLI launcher from pyproject.toml [project.scripts], with the native tool it wraps. */
export const HARNESSES: { launcher: string; binary: string; name: string; install: string }[] = [
  { launcher: "fcc-claude", binary: "claude", name: "Claude Code", install: "npm install -g @anthropic-ai/claude-code" },
  { launcher: "fcc-codex", binary: "codex", name: "Codex CLI", install: "npm install -g @openai/codex" },
  { launcher: "fcc-opencode", binary: "opencode", name: "OpenCode", install: "npm install -g opencode-ai" },
  { launcher: "fcc-cline", binary: "cline", name: "Cline CLI", install: "See docs.cline.bot" },
  { launcher: "fcc-aider", binary: "aider", name: "Aider", install: "See aider.chat/docs/install.html" },
  { launcher: "fcc-pi", binary: "pi", name: "Pi", install: "See the FCC README" },
  { launcher: "fcc-grok", binary: "grok", name: "Grok CLI", install: "See the FCC README" },
  { launcher: "fcc-hermes", binary: "hermes", name: "Hermes Agent", install: "See the FCC README" },
  { launcher: "fcc-dsh", binary: "dsh", name: "DeepSeek Harness", install: "npm install -g @deepseek-ai/dsh@latest" },
  { launcher: "fcc-muse", binary: "muse", name: "Muse Code", install: "Run install-muse.ps1" },
  { launcher: "fcc-agy", binary: "agy", name: "Antigravity CLI", install: "Install Antigravity" },
];

export async function listHarnesses(): Promise<HarnessInfo[] | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<HarnessInfo[]>("list_harnesses", { pairs: HARNESSES.map((h) => [h.launcher, h.binary]) });
}
export async function launchInTerminal(command: string, cwd?: string) {
  if (!isTauri()) throw new Error(`Open a terminal and run: ${command}`);
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("launch_in_terminal", { command, cwd: cwd || null });
}
export async function runCapture(command: "version" | "doctor"): Promise<string> {
  if (!isTauri()) throw new Error(command === "doctor" ? "Run fcc-doctor in a terminal" : "Run fcc-server --version in a terminal");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("run_capture", { command });
}
