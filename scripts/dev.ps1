<#
.SYNOPSIS
  Restart Mochi in development.

.DESCRIPTION
  Stops whatever is already running, waits for Windows to release its handles,
  then starts electron-vite in dev mode.

  This exists because the obvious one-liner rots. Two ways it already had:

  1. THE PROCESS NAME. The shipped binary is MochiTheCompanion.exe, not
     Mochi.exe -- see electron-builder.yml for why the build-time and runtime
     names deliberately differ. `Get-Process -Name "Mochi"` matches exactly and
     therefore misses it, so a packaged build survives the kill, keeps mochi.db
     locked, and leaves its overlay on screen while the dev instance starts
     underneath it. The wildcard below covers every past and present name, and
     "electron" covers the dev instance, which runs as plain electron.exe.

  2. THE PACKAGE MANAGER. `npx pnpm` re-resolves pnpm from the registry on
     every single invocation -- measured at 305s per run on a machine where the
     same registry answers a direct request in 2s. This prefers a real pnpm on
     PATH, and otherwise runs the workspace's own electron-vite, which needs no
     network at all.

.PARAMETER StopOnly
  Stop any running instance and exit without starting a new one.

.EXAMPLE
  ./scripts/dev.ps1
#>

[CmdletBinding()]
param(
  [switch]$StopOnly
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $repo 'apps/desktop'

# Mochi* catches MochiTheCompanion and any older Mochi.exe; electron catches a
# dev instance. Note that "electron" is the generic name, so an unpackaged
# Electron app from another project would be caught too -- packaged apps rename
# their binary, so in practice this only ever hits our own dev runs.
$running = @(Get-Process -Name 'Mochi*', 'electron' -ErrorAction SilentlyContinue)

if ($running.Count -gt 0) {
  foreach ($p in $running) { Write-Host "  stopping $($p.ProcessName) (pid $($p.Id))" }
  $running | Stop-Process -Force -ErrorAction SilentlyContinue
  # Long enough for the SQLite lock on mochi.db and the dev server port to be
  # released. 500ms was occasionally not.
  Start-Sleep -Milliseconds 1200
} else {
  Write-Host '  nothing running'
}

if ($StopOnly) { return }

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($null -ne $pnpm) {
  & pnpm --filter @mochi/desktop dev
  return
}

Write-Host '  pnpm not on PATH -- using the workspace electron-vite directly'
$bin = Join-Path $desktop 'node_modules/.bin/electron-vite.CMD'
if (-not (Test-Path $bin)) {
  throw "electron-vite not found at $bin. Install dependencies first."
}

Push-Location $desktop
try { & $bin dev } finally { Pop-Location }
