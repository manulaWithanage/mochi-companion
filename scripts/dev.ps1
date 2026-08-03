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

  # Wait for them to actually be gone rather than assuming a fixed delay covers
  # it. This used to sleep 1200ms and hope.
  #
  # It matters more than it looks. A force-killed Electron does not release its
  # single-instance lock the instant Stop-Process returns, and the next
  # instance calls app.requestSingleInstanceLock() within a second of starting.
  # Lose that race and the new instance exits immediately -- no window, no
  # error, and a process list that still looks populated because the *old*
  # processes are the ones you are seeing. It reads as "launched fine but
  # nothing appeared", which is the hardest kind of failure to chase.
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    if (@(Get-Process -Name 'Mochi*', 'electron' -ErrorAction SilentlyContinue).Count -eq 0) {
      break
    }
    Start-Sleep -Milliseconds 150
  }

  $stubborn = @(Get-Process -Name 'Mochi*', 'electron' -ErrorAction SilentlyContinue)
  if ($stubborn.Count -gt 0) {
    # Say so rather than starting anyway and producing the exact silent failure
    # this wait exists to prevent.
    Write-Warning "$($stubborn.Count) process(es) survived 15s: $(($stubborn | ForEach-Object { "$($_.ProcessName)($($_.Id))" }) -join ', ')"
    Write-Warning 'Starting anyway, but the new instance may lose the single-instance lock and exit without a window.'
  } else {
    Write-Host '  stopped cleanly'
  }

  # The handle is released as the process record disappears, but the OS is not
  # obliged to have finished tearing down the named lock at that exact moment.
  Start-Sleep -Milliseconds 400
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
