#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-only
# FCC Desk add-on installer for macOS and Linux. Adds the desktop app to an existing
# Free Claude Code install without reinstalling FCC. Not affiliated with Anthropic.
set -eu

repo="akinmadetobiloba00-prog/free-claude-code"
tag=""
from_file=""
dry_run=0
install_codex=0

usage() {
    cat <<USAGE
Usage: install-desktop.sh [options]

Installs or updates FCC Desk, the desktop app for Free Claude Code.
Your FCC install, config, keys and sessions are not changed.

Options:
  --from-file PATH   Install from a local .deb, .AppImage or .dmg build.
  --repo OWNER/NAME  GitHub repo for releases (default: $repo).
  --tag TAG          Release tag (default: newest release with an FCC Desk build).
  --install-codex    Also run: npm install -g @openai/codex (Desk chat uses Codex).
  --dry-run          Print actions without changing anything.
  --help             Show this help text.
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --from-file) from_file="$2"; shift ;;
        --repo) repo="$2"; shift ;;
        --tag) tag="$2"; shift ;;
        --install-codex) install_codex=1 ;;
        --dry-run) dry_run=1 ;;
        --help|-h) usage; exit 0 ;;
        *) usage; echo "Unknown option: $1" >&2; exit 2 ;;
    esac
    shift
done

step() { printf '==> %s\n' "$1"; }
run() { if [ "$dry_run" -eq 1 ]; then printf '    [dry run] %s\n' "$*"; else "$@"; fi; }

step "Checking your Free Claude Code install"
PATH="$PATH:$HOME/.local/bin"
if ! command -v fcc-server >/dev/null 2>&1; then
    echo "fcc-server was not found. Install Free Claude Code first (scripts/install.sh)." >&2
    exit 1
fi
echo "    Found $(fcc-server --version 2>/dev/null)"

if command -v codex >/dev/null 2>&1; then
    echo "    Codex CLI found"
elif [ "$install_codex" -eq 1 ]; then
    step "Installing Codex CLI"; run npm install -g @openai/codex
else
    echo "    Warning: Codex CLI not found. FCC Desk chat needs it: npm install -g @openai/codex" >&2
fi

os="$(uname -s)"
case "$os" in
    Darwin) pattern='\.dmg$' ;;
    Linux) if command -v dpkg >/dev/null 2>&1; then pattern='_amd64\.deb$'; else pattern='\.AppImage$'; fi ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
esac

file="$from_file"
if [ -z "$file" ]; then
    step "Looking for an FCC Desk release on github.com/$repo"
    if [ -n "$tag" ]; then api="https://api.github.com/repos/$repo/releases/tags/$tag"; else api="https://api.github.com/repos/$repo/releases?per_page=20"; fi
    url="$(curl -fsSL -H 'User-Agent: fcc-desk-installer' "$api" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"/\1/' | grep -E "FCC[._-]Desk.*$pattern|fcc-desk.*$pattern" | head -n 1 || true)"
    [ -n "$url" ] || { echo "No FCC Desk build for $os found in $repo releases. Use --from-file with a CI build." >&2; exit 1; }
    case "$url" in https://github.com/*) ;; *) echo "Refusing to download from $url" >&2; exit 1 ;; esac
    file="${TMPDIR:-/tmp}/$(basename "$url")"
    run curl -fL "$url" -o "$file"
fi

step "Installing FCC Desk from $file"
case "$file" in
    *.deb) run sudo apt-get install -y "$file" ;;
    *.AppImage) run mkdir -p "$HOME/.local/bin"; run install -m 0755 "$file" "$HOME/.local/bin/fcc-desk" ;;
    *.dmg)
        if [ "$dry_run" -eq 1 ]; then echo "    [dry run] mount $file and copy FCC Desk.app to /Applications"; else
            mnt="$(hdiutil attach -nobrowse "$file" | tail -n 1 | sed 's/.*\(\/Volumes\/.*\)/\1/')"
            rm -rf "/Applications/FCC Desk.app"; cp -R "$mnt/FCC Desk.app" /Applications/; hdiutil detach "$mnt" >/dev/null
        fi ;;
    *) echo "Unknown installer type: $file" >&2; exit 1 ;;
esac
[ "$dry_run" -eq 1 ] && { echo "Dry run complete. No changes were made."; exit 0; }
echo "FCC Desk is installed. It uses your existing FCC server, keys and sessions; the fcc-* terminal commands are unchanged."
