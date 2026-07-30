/**
 * Reads which application is in the foreground.
 *
 * **The one place in Mochi that needs something the platform does not hand to
 * Electron.** There is no API for another application's foreground window, so
 * the choice was a shipped native binary or the OS API through a shell. This
 * takes the shell, which keeps the project's zero-native-dependency property
 * intact — no compile step, no bundled executable, nothing extra to sign or to
 * be flagged by antivirus.
 *
 * It is deliberately behind a tiny interface. Swapping in `active-win` later
 * changes this file and nothing above it.
 *
 * **Window titles are never read.** Only the process name and the idle timer.
 * A title carries client names, document names and URLs; a process name is an
 * application. GetWindowText is not called, so there is nothing to leak.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface ForegroundSample {
  /** Raw process name, e.g. `Code` or `WhatsApp.Root`. Empty if unknown. */
  readonly process: string;
  /** Milliseconds since the last keyboard or mouse input, system-wide. */
  readonly idleMs: number;
}

export interface ForegroundSource {
  start(onSample: (sample: ForegroundSample) => void): void;
  stop(): void;
  readonly supported: boolean;
}

/**
 * The PowerShell side.
 *
 * A single long-lived process that prints one line per interval, rather than a
 * fresh `powershell.exe` per sample — process startup is ~100ms of CPU, which
 * at a ten-second interval would be a permanent 1% tax for a value that
 * changes slowly.
 *
 * `GetLastInputInfo` is what makes the numbers honest: without it, a machine
 * left unlocked overnight reports eight hours in whatever was on screen.
 */
function script(intervalSeconds: number): string {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MochiFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static int Pid() { int p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
  public static uint IdleMs() {
    LASTINPUTINFO li = new LASTINPUTINFO(); li.cbSize = (uint)Marshal.SizeOf(li);
    GetLastInputInfo(ref li); return (uint)Environment.TickCount - li.dwTime;
  }
}
'@
while ($true) {
  try {
    $p = [MochiFg]::Pid()
    $n = ''
    if ($p -gt 0) { $n = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName }
    if (-not $n) { $n = '' }
    Write-Output ("{0}|{1}" -f $n, [MochiFg]::IdleMs())
  } catch {
    Write-Output "|0"
  }
  Start-Sleep -Seconds ${intervalSeconds}
}
`.trim();
}

/**
 * PowerShell's -EncodedCommand expects base64 of UTF-16LE, not UTF-8.
 *
 * Exported so the encoding is covered by a test: getting it wrong produces a
 * process that starts, prints a parse error to stderr that nothing reads, and
 * exits — which looks exactly like an idle user.
 */
export function encodeScript(intervalSeconds: number): string {
  return Buffer.from(script(intervalSeconds), 'utf16le').toString('base64');
}

/** Wait this long before restarting a helper that died, so a failing spawn cannot loop hot. */
const RESTART_DELAY_MS = 30_000;

export class WindowsForegroundSource implements ForegroundSource {
  // stdin is ignored: the script arrives as an argument, not on the pipe.
  private child: ChildProcess | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private buffer = '';

  constructor(private readonly intervalSeconds: number) {}

  get supported(): boolean {
    return process.platform === 'win32';
  }

  start(onSample: (sample: ForegroundSample) => void): void {
    if (!this.supported || this.child !== null) return;
    this.stopped = false;

    try {
      // `-EncodedCommand`, not `-Command -`.
      //
      // Reading the script from stdin looks tidier and does not work: with
      // `-Command -` PowerShell treats stdin as if typed at a prompt, so a
      // multi-line here-string and a `while` block never execute. The process
      // exits 0 having produced nothing, which is indistinguishable from "the
      // user was idle" and is exactly how this shipped broken the first time.
      //
      // Encoding the whole script as one UTF-16LE argument sidesteps both the
      // stdin parsing and the quoting minefield.
      this.child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodeScript(this.intervalSeconds)],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch {
      console.warn('[activity] could not start the foreground helper');
      return;
    }

    const child = this.child;
    if (child === null) return;
    if (child.stdout !== null) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/);
        // The last element is a partial line until the next chunk arrives.
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
          const parsed = parseLine(line);
          if (parsed !== null) onSample(parsed);
        }
      });
    }

    // PowerShell writes a `#< CLIXML` preamble here on every run; it is normal.
    // Nothing from the sampler is worth surfacing, and the Activity tab already
    // shows whether anything is being recorded.
    if (child.stderr !== null) {
      child.stderr.on('data', () => undefined);
    }

    child.on('exit', () => {
      this.child = null;
      if (this.stopped) return;
      this.restartTimer = setTimeout(() => this.start(onSample), RESTART_DELAY_MS);
      this.restartTimer.unref?.();
    });

  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    // The helper is an infinite loop; it only ends when killed.
    this.child?.kill();
    this.child = null;
  }
}

/** `Code|4213` → a sample. Returns null for anything malformed. */
export function parseLine(line: string): ForegroundSample | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  const separator = trimmed.lastIndexOf('|');
  if (separator < 0) return null;

  const idleMs = Number(trimmed.slice(separator + 1));
  if (!Number.isFinite(idleMs) || idleMs < 0) return null;

  return { process: trimmed.slice(0, separator).trim(), idleMs };
}

/** Nothing to sample on platforms without an implementation yet. */
export class UnsupportedForegroundSource implements ForegroundSource {
  readonly supported = false;
  start(): void {
    /* no-op */
  }
  stop(): void {
    /* no-op */
  }
}

export function createForegroundSource(intervalSeconds: number): ForegroundSource {
  return process.platform === 'win32'
    ? new WindowsForegroundSource(intervalSeconds)
    : new UnsupportedForegroundSource();
}
