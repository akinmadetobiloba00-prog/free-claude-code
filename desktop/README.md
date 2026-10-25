# FCC Desk

FCC Desk is a desktop app for [Free Claude Code](../README.md) (FCC). It gives FCC a chat window:
a home screen with a big composer, streaming chat, sessions, a model switcher, provider setup and themes.

**Not affiliated with Anthropic.** Claude and Claude Code are trademarks of Anthropic, PBC.
FCC Desk uses its own name and logo and open-licence fonts (Newsreader, Inter, JetBrains Mono, SIL OFL).

## How it fits with the terminal

- FCC Desk talks to the same local `fcc-server` (default `http://127.0.0.1:8082`). If the server
  is not running, FCC Desk starts it in the background (`fcc-server --auto-started`).
- Keys, models and settings are the normal FCC config (`~/.fcc/.env`). A key you add in FCC Desk is
  used by `fcc-claude`, `fcc-codex` and the others, and the other way round.
- Chat sessions are FCC "code sessions" (the same ones as Admin -> Code). They run the Codex CLI
  harness through FCC, so **Codex CLI must be installed**: `npm install -g @openai/codex`.
- The CLI is unchanged. The **Harnesses & CLI** screen lists every `fcc-*` command and opens it in a
  terminal window.

| CLI command | FCC Desk |
|---|---|
| `fcc-server` | Started for you when it is not running; tray menu |
| `fcc-claude`, `fcc-codex`, `fcc-opencode`, `fcc-cline`, `fcc-aider`, `fcc-pi`, `fcc-grok`, `fcc-hermes`, `fcc-dsh`, `fcc-muse`, `fcc-agy` | Harnesses & CLI -> Launch (opens a terminal in your folder) |
| `fcc-doctor` | Harnesses & CLI -> Run fcc-doctor (shows the report) |
| `fcc-server --version` | Harnesses & CLI -> fcc-server --version |
| `fcc-update` | Harnesses & CLI -> fcc-update (terminal) |
| `fcc-desktop` (tray only) | Replaced by FCC Desk's own tray; both can be installed |
| Admin UI (providers, models) | Providers & models |
| Admin UI (integrations, messaging, voice) | "Full Admin" button (opens the browser Admin) |

## Develop

Needs Node 20+ with pnpm, Rust stable, and on Windows the WebView2 runtime (already on Windows 10/11)
plus Visual Studio C++ Build Tools. On Linux: `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.

```sh
cd desktop
pnpm install
pnpm dev          # browser preview at http://localhost:1420 (proxies to fcc-server)
pnpm app:dev      # the real desktop window (generates icons first)
pnpm app:build    # installers in src-tauri/target/release/bundle/
```

## Add-on install for existing FCC users

Windows: `scripts/install-desktop.ps1` (or `-FromFile <setup.exe>` for a local build).
macOS/Linux: `scripts/install-desktop.sh`. New installs can pass `-Desktop` / `--desktop` to the main installer.

## Licence

AGPL-3.0-only, same as Free Claude Code (Copyright (c) 2026 Ali Khokhar). FCC Desk changes are by
FCC Desk contributors and are released under the same licence. The logo is a placeholder and will be refined.
