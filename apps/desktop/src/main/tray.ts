/**
 * System tray icon and menu.
 *
 * Also the only always-available way back to Settings, since the overlay is
 * click-through and focusable: false.
 */

import { Menu, Tray, nativeImage, app } from 'electron';
import { formatDuration } from '@mochi/core';
import type { TimerService } from './services/timer-service.js';
import type { SettingsStore } from './storage/settings-store.js';

/**
 * A 16x16 dot drawn at runtime — avoids shipping a binary asset before the
 * real artwork exists. Replaced when skins/default gains a tray icon.
 */
function placeholderIcon(): Electron.NativeImage {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const inside = Math.hypot(x - cx, y - cx) <= size / 2 - 1.5;
      // BGRA order.
      buffer[i] = inside ? 0xb3 : 0x00;
      buffer[i + 1] = inside ? 0xa6 : 0x00;
      buffer[i + 2] = inside ? 0xf2 : 0x00;
      buffer[i + 3] = inside ? 0xff : 0x00;
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

export interface TrayCallbacks {
  onOpenSettings(): void;
  onTogglePaused(paused: boolean): void;
  onStopTimer(): void;
}

export class MochiTray {
  private tray: Tray | null = null;
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    private readonly timer: TimerService,
    private readonly settings: SettingsStore,
    private readonly callbacks: TrayCallbacks,
  ) {}

  create(): void {
    this.tray = new Tray(placeholderIcon());
    this.tray.setToolTip('Mochi');
    this.tray.on('click', () => this.callbacks.onOpenSettings());
    this.rebuild();

    // Tooltip only — cheap, and stops when nothing is running.
    this.ticker = setInterval(() => this.refreshTooltip(), 30_000);
    this.ticker.unref?.();
  }

  rebuild(): void {
    if (this.tray === null) return;
    const paused = this.settings.get().paused;
    const name = this.settings.get().assistantName;
    const snapshot = this.timer.snapshot();

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: snapshot.running
            ? `Tracking — ${formatDuration(snapshot.elapsedMs)}`
            : 'Not tracking',
          enabled: false,
        },
        ...(snapshot.running
          ? [{ label: 'Stop timer', click: () => this.callbacks.onStopTimer() }]
          : []),
        { type: 'separator' as const },
        { label: 'Open Settings…', click: () => this.callbacks.onOpenSettings() },
        {
          label: paused ? `Resume ${name}` : `Pause ${name}`,
          click: () => this.callbacks.onTogglePaused(!paused),
        },
        { type: 'separator' as const },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
    this.refreshTooltip();
  }

  private refreshTooltip(): void {
    if (this.tray === null) return;
    const snapshot = this.timer.snapshot();
    this.tray.setToolTip(
      snapshot.running ? `Mochi — ${formatDuration(snapshot.elapsedMs)}` : 'Mochi',
    );
  }

  destroy(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.tray?.destroy();
    this.tray = null;
  }
}
