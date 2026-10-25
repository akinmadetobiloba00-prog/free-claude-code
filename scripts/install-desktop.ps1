# SPDX-License-Identifier: AGPL-3.0-only
# FCC Desk add-on installer for Windows. Adds the desktop app to an existing Free Claude Code
# install without reinstalling FCC. Modeled on install-muse.ps1. Not affiliated with Anthropic.
[CmdletBinding()]
param(
    [string] $FromFile = "",
    [string] $Repo = "akinmadetobiloba00-prog/free-claude-code",
    [string] $Tag = "",
    [switch] $InstallCodex,
    [switch] $DryRun,
    [switch] $Help,
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]] $RemainingArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Show-DeskInstallerUsage {
    @"
Usage: install-desktop.ps1 [options]

Installs or updates FCC Desk, the desktop app for Free Claude Code.
Your FCC install, config, keys and sessions are not changed.

Options:
  -FromFile PATH   Install from a local FCC Desk setup .exe or .msi (for testing builds).
  -Repo OWNER/NAME GitHub repo to download releases from (default: $Repo).
  -Tag TAG         Release tag to install (default: newest release that has an FCC Desk installer).
  -InstallCodex    Also install the Codex CLI (npm install -g @openai/codex). Desk chat uses it.
  -DryRun          Print actions without downloading or changing anything.
  -Help            Show this help text.

To remove FCC Desk, run scripts/uninstall-desktop.ps1.
"@
}

function Write-DeskStep { param([string] $Message) Write-Host "==> $Message" -ForegroundColor DarkYellow }
function Find-Command { param([string] $Name) $c = Get-Command $Name -ErrorAction SilentlyContinue; if ($c) { return $c.Source } return $null }

if ($Help) { Show-DeskInstallerUsage; return }
if ($RemainingArgs.Count -gt 0) { Show-DeskInstallerUsage; throw "Unknown option: $($RemainingArgs -join ' ')" }

# 1. FCC must already be installed. We only check it; we never reinstall it.
Write-DeskStep "Checking your Free Claude Code install"
$fcc = Find-Command "fcc-server"
if (-not $fcc) {
    $candidate = Join-Path $env:USERPROFILE ".local\bin\fcc-server.exe"
    if (Test-Path $candidate) { $fcc = $candidate }
}
if (-not $fcc) {
    throw "fcc-server was not found. Install Free Claude Code first (scripts/install.ps1), then run this again."
}
$version = (& $fcc --version) 2>$null
Write-Host "    Found $version at $fcc"

# 2. Codex CLI powers Desk chat sessions (the FCC code-session harness).
$codex = Find-Command "codex"
if ($codex) { Write-Host "    Codex CLI found: $codex" }
elseif ($InstallCodex) {
    Write-DeskStep "Installing Codex CLI"
    if (-not (Find-Command "npm")) { throw "npm was not found. Install Node.js LTS first, or re-run without -InstallCodex." }
    if ($DryRun) { Write-Host "    [dry run] npm install -g @openai/codex" } else { npm install -g @openai/codex | Out-Host }
}
else {
    Write-Warning "Codex CLI was not found. FCC Desk chat needs it. Install it with: npm install -g @openai/codex (or re-run with -InstallCodex)."
}

# 3. Get the installer (local file for testing, or a GitHub release asset).
$setup = $null
if ($FromFile) {
    $setup = (Resolve-Path $FromFile).Path
    Write-DeskStep "Using local installer $setup"
}
else {
    Write-DeskStep "Looking for an FCC Desk release on github.com/$Repo"
    $headers = @{ "User-Agent" = "fcc-desk-installer"; "Accept" = "application/vnd.github+json" }
    $releases = if ($Tag) { @(Invoke-RestMethod -Headers $headers "https://api.github.com/repos/$Repo/releases/tags/$Tag") }
                else { @(Invoke-RestMethod -Headers $headers "https://api.github.com/repos/$Repo/releases?per_page=20") }
    $asset = $null
    foreach ($r in $releases) {
        $asset = $r.assets | Where-Object { $_.name -match '^FCC[ ._-]Desk.*x64-setup\.exe$' } | Select-Object -First 1
        if ($asset) { Write-Host "    Release: $($r.tag_name)"; break }
    }
    if (-not $asset) { throw "No FCC Desk Windows installer was found in the releases of $Repo. Use -FromFile with a CI build instead." }
    $uri = [Uri] $asset.browser_download_url
    if ($uri.Scheme -ne "https" -or $uri.DnsSafeHost -notin @("github.com", "objects.githubusercontent.com")) { throw "Refusing to download from $uri" }
    $setup = Join-Path $env:TEMP $asset.name
    if ($DryRun) { Write-Host "    [dry run] download $uri" } else { Invoke-WebRequest -Uri $uri -OutFile $setup -UseBasicParsing }
}

# 4. Install per-user (no admin). NSIS .exe uses /S; MSI uses msiexec /passive.
Write-DeskStep "Installing FCC Desk"
if ($DryRun) { Write-Host "    [dry run] run $setup"; Write-Host "Dry run complete. No changes were made."; return }
if ($setup -like "*.msi") { $p = Start-Process msiexec.exe -ArgumentList @("/i", "`"$setup`"", "/passive") -Wait -PassThru }
else { $p = Start-Process $setup -ArgumentList "/S" -Wait -PassThru }
if ($p.ExitCode -ne 0) { throw "The FCC Desk installer failed with exit code $($p.ExitCode)." }

Write-Host ""
Write-Host "FCC Desk is installed. Open it from the Start menu ('FCC Desk')." -ForegroundColor Green
Write-Host "It uses your existing FCC server, keys and sessions. The terminal commands (fcc-claude, fcc-codex, ...) work exactly as before."
