/**
 * System tray icon and menu.
 *
 * Also the only always-available way back to Settings, since the overlay is
 * click-through and focusable: false.
 */

import { Menu, Tray, app } from 'electron';
import { formatDuration } from '@mochi/core';
import type { TimerService } from './services/timer-service.js';
import type { SettingsStore } from './storage/settings-store.js';
import { mochiTrayIcon } from './tray-icon.js';

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
    this.tray = new Tray(mochiTrayIcon());
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
