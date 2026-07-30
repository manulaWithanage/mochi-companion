/**
 * The setup / settings window — normal chrome, resizable, taskbar entry.
 *
 * Deliberately separate from the overlay: transparent click-through windows
 * are hostile to forms (focus behaves oddly and the click-through toggle
 * fights text inputs).
 */

import { BrowserWindow } from 'electron';
import { join } from 'node:path';

export class SetupWindow {
  private win: BrowserWindow | null = null;

  open(): BrowserWindow {
    if (this.win !== null && !this.win.isDestroyed()) {
      this.win.focus();
      return this.win;
    }

    this.win = new BrowserWindow({
      width: 1180,
      height: 740,
      resizable: true,
      minWidth: 960,
      minHeight: 640,
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
    this.win.once('ready-to-show', () => this.win?.show());
    this.win.on('closed', () => {
      this.win = null;
    });

    void this.load();
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
