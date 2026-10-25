# Testing FCC Desk v1 on Windows

Short and exact. Do Part A or Part B (or both). Nothing here changes how the `fcc-*` terminal commands work.

## Before you start (once)

1. Free Claude Code is installed and works: open PowerShell and run `fcc-server --version`.
2. Install **Codex CLI**. FCC Desk chat runs through it:
   `npm install -g @openai/codex` (needs Node.js LTS from nodejs.org).
3. Have a provider key ready, for example OpenRouter (openrouter.ai/keys). Free models end in `:free`.
4. Make a test folder, for example `C:\Users\<you>\fcc-test`. The agent can read and write inside it.

## Part A: run from source in Antigravity (VS Code-style IDE)

One-time tools:
- Rust: install from https://rustup.rs (choose the default MSVC option; it also offers the Visual Studio C++ Build Tools. Accept them).
- pnpm: `npm install -g pnpm`
- WebView2 is already on Windows 10/11.

Steps (Antigravity terminal, PowerShell):
```powershell
git clone -b fcc-desk https://github.com/akinmadetobiloba00-prog/free-claude-code.git
cd free-claude-code\desktop
pnpm install
pnpm app:dev          # first run compiles Rust, takes 3-8 minutes
```
A window called **FCC Desk** opens. If `fcc-server` is not running, the app starts it for you.

Quick browser-only preview (no Rust needed): start `fcc-server` in one terminal, then `pnpm dev`
in `desktop\`, and open http://localhost:1420.

Build an installer yourself: `pnpm app:build` → `desktop\src-tauri\target\release\bundle\nsis\FCC Desk_0.1.0_x64-setup.exe`.

## Part B: add-on to your existing FCC install

Use the setup `.exe` from Part A, or from GitHub Actions (repo → Actions → "FCC Desk" → latest run →
Artifacts → `fcc-desk-windows-latest`, unzip it). Then in PowerShell, from the cloned repo folder:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop.ps1 -FromFile "C:\path\to\FCC Desk_0.1.0_x64-setup.exe"
```
It checks `fcc-server` exists (it does **not** reinstall FCC), warns if Codex is missing, then installs
FCC Desk for your user only. Open **FCC Desk** from the Start menu.
Windows SmartScreen may warn because the test build is unsigned: click **More info → Run anyway**.
Remove it later with `scripts\uninstall-desktop.ps1` (FCC stays).

## Checklist (tick each)

1. **Starts**: open FCC Desk with `fcc-server` stopped → it shows "Starting FCC…" then the home screen.
2. **Key**: Providers & models → OpenRouter → paste key → Save → green dot "Configured".
   (If you set `OPENROUTER_API_KEY` as a Windows environment variable, FCC uses that and the field is locked. That is expected.)
3. **Default model**: in Providers & models, pick a `:free` model, e.g. `nvidia/nemotron-3.5-lightning:free`.
4. **Chat**: Home → pick your test folder (folder icon, or type the path) → type "Say hello" → Enter.
   You see the reply appear, and a collapsible "Thinking" card.
5. **Approve/deny**: ask "Create a file hello.txt with the word hi". If an approval card appears, click Allow or Deny.
6. **Model switch**: in the chat, change the model in the composer → send another message → it answers.
7. **Sessions**: hover a session → ⋯ → Pin, Rename, Delete. Use the search box. Close and reopen the app: sessions are still there.
8. **Themes**: Settings → Clay Dark, Light, Inverted/OLED, High contrast, and a custom accent.
9. **Tray**: closing the window hides it to the tray. Tray menu → Open / Full Admin / Quit.
10. **Harnesses & CLI**: shows which `fcc-*` tools are installed. Launch one → a terminal window opens running it.
11. **CLI unchanged**: in a normal terminal, `fcc-claude` (or `fcc-codex`) still works as before, with the same key.

Report problems with: the step number, a screenshot, and the output of `fcc-doctor`.
