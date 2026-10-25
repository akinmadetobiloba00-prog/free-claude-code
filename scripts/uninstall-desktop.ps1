# SPDX-License-Identifier: AGPL-3.0-only
# Removes FCC Desk only. Free Claude Code, its config, keys and sessions are kept.
[CmdletBinding()]
param([switch] $DryRun)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$candidates = @(
    (Join-Path $env:LOCALAPPDATA "FCC Desk\uninstall.exe"),
    (Join-Path $env:ProgramFiles "FCC Desk\uninstall.exe")
)
$u = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $u) {
    $msi = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
        Where-Object { $_.PSObject.Properties["DisplayName"] -and $_.DisplayName -eq "FCC Desk" } | Select-Object -First 1
    if (-not $msi) { Write-Host "FCC Desk is not installed."; return }
    if ($DryRun) { Write-Host "[dry run] $($msi.UninstallString)"; return }
    Start-Process cmd.exe -ArgumentList "/c", $msi.UninstallString -Wait
}
else {
    if ($DryRun) { Write-Host "[dry run] $u /S"; return }
    Start-Process $u -ArgumentList "/S" -Wait
}
Write-Host "FCC Desk removed. Free Claude Code is still installed."
