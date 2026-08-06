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
 *
 * **Colour on Windows, black-on-alpha on macOS.** The macOS menu bar expects a
 * *template* image: a monochrome silhouette that the system recolours to match
 * the bar, which flips between black and white with the appearance setting and
 * again when the bar sits over a dark wallpaper. A coloured icon is left
 * exactly as given, so Mochi's pink would stay pink against a dark menu bar and
 * read as a foreign object rather than a menu bar item.
 */
function placeholderIcon(): Electron.NativeImage {
  const size = 16;
  const template = process.platform === 'darwin';
  const buffer = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const inside = Math.hypot(x - cx, y - cx) <= size / 2 - 1.5;
      // BGRA order. A template image carries shape in the alpha channel only;
      // the colour channels are ignored, so they are left black.
      buffer[i] = inside && !template ? 0xb3 : 0x00;
      buffer[i + 1] = inside && !template ? 0xa6 : 0x00;
      buffer[i + 2] = inside && !template ? 0xf2 : 0x00;
      buffer[i + 3] = inside ? 0xff : 0x00;
    }
  }
  const image = nativeImage.createFromBuffer(buffer, { width: size, height: size });
  if (template) image.setTemplateImage(true);
  return image;
}

export interface TrayCallbacks {
  onOpenSettings(): void;
  onTogglePaused(paused: boolean): void;
  onToggleDoNotDisturb(dnd: boolean): void;
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
    const dnd = this.settings.get().doNotDisturb;
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
          // Distinct from Pause: Mochi stays on screen and keeps tracking
          // time, it just stops speaking unprompted.
          label: 'Do not disturb',
          type: 'checkbox' as const,
          checked: dnd,
          click: () => this.callbacks.onToggleDoNotDisturb(!dnd),
        },
        {
          label: paused ? `Resume ${name}` : `Hide ${name}`,
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
