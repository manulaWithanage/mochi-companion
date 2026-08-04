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
 * **Window titles are not read unless the user turns on site tracking.** By
 * default only the process name and the idle timer are collected, and the
 * generated script contains no `GetWindowText` at all — there is no code path to
 * audit rather than a flag that could be got wrong. A test asserts both halves.
 *
 * This comment used to say titles were never read, full stop, and kept saying it
 * after opt-in site tracking was added forty lines below. An overclaim in the
 * header of the file that does the reading is the worst place for one: it is
 * where someone checks. `MOCHI_BRAIN.md` had it right — claiming less and
 * meaning it beats a guarantee the code does not keep.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface ForegroundSample {
  /** Raw process name, e.g. `Code` or `WhatsApp.Root`. Empty if unknown. */
  readonly process: string;
  /** Milliseconds since the last keyboard or mouse input, system-wide. */
  readonly idleMs: number;
  /**
   * Window title, present only when site tracking is on.
   *
   * Matched against a fixed site list and discarded in the same tick. It is
   * never stored, never logged and never sent anywhere.
   */
  readonly title?: string;
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
/**
 * The title-reading members, injected only when the user asked for them.
 *
 * Conditional *generation* rather than a runtime flag: with site tracking off
 * the script does not contain GetWindowText at all, so there is no code path to
 * audit and no flag to get wrong. A test asserts both halves of that.
 */
const TITLE_MEMBERS = `
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder sb, int n);
  public static string Title() {
    var sb = new System.Text.StringBuilder(512);
    GetWindowText(GetForegroundWindow(), sb, sb.Capacity);
    return sb.ToString().Replace("|", " ");
  }`;

function script(intervalSeconds: number, withTitle: boolean): string {
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
  public static int Pid() { int p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }${withTitle ? TITLE_MEMBERS : ''}
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
    $t = ${withTitle ? '[MochiFg]::Title()' : "''"}
    Write-Output ("{0}|{1}|{2}" -f $n, [MochiFg]::IdleMs(), $t)
  } catch {
    Write-Output "|0|"
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
export function encodeScript(intervalSeconds: number, withTitle = false): string {
  return Buffer.from(script(intervalSeconds, withTitle), 'utf16le').toString('base64');
}

/** Wait this long before restarting a helper that died, so a failing spawn cannot loop hot. */
const RESTART_DELAY_MS = 30_000;

export class WindowsForegroundSource implements ForegroundSource {
  // stdin is ignored: the script arrives as an argument, not on the pipe.
  private child: ChildProcess | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private buffer = '';

  constructor(
    private readonly intervalSeconds: number,
    private readonly withTitle: boolean,
  ) {}

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
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          encodeScript(this.intervalSeconds, this.withTitle),
        ],
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

  // `process|idleMs|title`. The title may be empty and the process name may
  // itself contain a pipe, so the two separators are found from known ends
  // rather than by splitting.
  const last = trimmed.lastIndexOf('|');
  if (last < 0) return null;
  const first = trimmed.lastIndexOf('|', last - 1);
  if (first < 0) return null;

  const idleMs = Number(trimmed.slice(first + 1, last));
  if (!Number.isFinite(idleMs) || idleMs < 0) return null;

  const title = trimmed.slice(last + 1).trim();
  return {
    process: trimmed.slice(0, first).trim(),
    idleMs,
    ...(title.length > 0 ? { title } : {}),
  };
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

export function createForegroundSource(
  intervalSeconds: number,
  withTitle = false,
): ForegroundSource {
  return process.platform === 'win32'
    ? new WindowsForegroundSource(intervalSeconds, withTitle)
    : new UnsupportedForegroundSource();
}
