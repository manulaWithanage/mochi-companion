/**
 * The setup / settings window — normal chrome, resizable, taskbar entry.
 *
 * Deliberately separate from the overlay: transparent click-through windows
 * are hostile to forms (focus behaves oddly and the click-through toggle
 * fights text inputs).
 */

import { BrowserWindow } from 'electron';
import { join } from 'node:path';

/** How long to wait for `ready-to-show` before showing the window regardless. */
const REVEAL_TIMEOUT_MS = 5_000;

export class SetupWindow {
  private win: BrowserWindow | null = null;

  open(): BrowserWindow {
    if (this.win !== null && !this.win.isDestroyed()) {
      this.win.focus();
      return this.win;
    }

    this.win = new BrowserWindow({
      width: 1360,
      height: 860,
      resizable: true,
      minWidth: 1040,
      minHeight: 680,
      minimizable: true,
      maximizable: true,
      title: 'Mochi',
      icon: join(import.meta.dirname, '../../assets/icon.png'),
      backgroundColor: '#1b1720',
      show: false,
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    this.win.setMenuBarVisibility(false);

    /*
     * `show: false` means this window is only ever revealed by `ready-to-show`,
     * and that event never fires if the renderer fails to load. The result is a
     * live process with no visible window and nothing in the UI to say why —
     * indistinguishable, to the user, from the app not starting at all. It is
     * the first-run report: "running behind the screen, nothing comes up".
     *
     * So the reveal is also on a timer. A blank window the user can see, close
     * and report on is strictly better than an invisible one.
     */
    const revealFallback = setTimeout(() => {
      if (this.win !== null && !this.win.isDestroyed() && !this.win.isVisible()) {
        console.error('[setup-web] renderer never became ready; showing the window anyway');
        this.win.show();
      }
    }, REVEAL_TIMEOUT_MS);
    revealFallback.unref?.();

    this.win.once('ready-to-show', () => {
      clearTimeout(revealFallback);
      this.win?.show();
    });
    this.win.on('closed', () => {
      clearTimeout(revealFallback);
      this.win = null;
    });

    this.win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[setup-web] [${level}] ${message} (${sourceId}:${line})`);
    });
    this.win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      console.error(
        `[setup-web] FAILED TO LOAD: ${errorCode} ${errorDescription} (${validatedURL})`,
      );
    });
    this.win.webContents.on('render-process-gone', (_e, details) => {
      console.error(`[setup-web] RENDER PROCESS GONE:`, details);
    });

    // Rejections here were unhandled: `loadFile` failing left the window
    // permanently hidden and said nothing.
    void this.load().catch((error: unknown) => {
      console.error('[setup-web] load failed:', error);
    });
    return this.win;
  }

  private async load(): Promise<void> {
    if (this.win === null) return;
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl !== undefined) {
      await this.win.loadURL(`${devUrl}/setup.html`);
    } else {
      await this.win.loadFile(join(import.meta.dirname, '../renderer/setup.html'));
    }
  }

  close(): void {
    if (this.win !== null && !this.win.isDestroyed()) this.win.close();
    this.win = null;
  }

  send(channel: string, payload: unknown): void {
    if (this.win === null || this.win.isDestroyed()) return;
    this.win.webContents.send(channel, payload);
  }

  get isOpen(): boolean {
    return this.win !== null && !this.win.isDestroyed();
  }
}
