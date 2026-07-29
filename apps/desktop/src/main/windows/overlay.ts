/**
 * The transparent mascot overlay.
 *
 * RULE 3: the window is small and fixed, and is repositioned by moving the
 * window itself. There is no fullscreen transparent surface. It is slightly
 * larger than the mascot to leave room for a speech bubble; the extra area
 * is transparent and inert, and hover is a cheap alpha sample on the canvas.
 *
 * The size never changes. Growing and shrinking it around a bubble made
 * Chromium composite the old surface into the new frame, flashing a ghost
 * mascot at the wrong offset every time a bubble cleared.
 */

import { BrowserWindow, screen, powerMonitor, type Display } from 'electron';
import { join } from 'node:path';
import {
  displayContaining,
  OVERLAY_SIZE,
  resolvePlacement,
  type DisplayInfo,
  type OverlayPosition,
  type Point,
} from '@mochi/core';

/** Debounce for persisting position while the user drags. */
const SAVE_DEBOUNCE_MS = 400;

const toDisplayInfo = (d: Display): DisplayInfo => ({
  id: d.id,
  workArea: { x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height },
});

export interface OverlayCallbacks {
  onPositionChanged(position: OverlayPosition): void;
}

export class OverlayWindow {
  private win: BrowserWindow | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private visible = true;

  constructor(private readonly callbacks: OverlayCallbacks) {}

  create(saved: OverlayPosition | null): BrowserWindow {
    const placement = resolvePlacement(
      saved,
      OVERLAY_SIZE,
      screen.getAllDisplays().map(toDisplayInfo),
      screen.getPrimaryDisplay().id,
    );

    this.win = new BrowserWindow({
      width: OVERLAY_SIZE.width,
      height: OVERLAY_SIZE.height,
      x: placement.position.x,
      y: placement.position.y,
      transparent: true,
      frame: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      // Focusing the overlay would steal focus from whatever the user is
      // actually working in. It never needs keyboard input.
      focusable: false,
      show: false,
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });

    // 'screen-saver' is the level that survives fullscreen apps on macOS;
    // plain alwaysOnTop is not enough.
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Click-through by default. `forward: true` keeps mousemove flowing so the
    // renderer can detect hover over the mascot and ask us to re-enable input.
    this.win.setIgnoreMouseEvents(true, { forward: true });

    if (placement.relocated) {
      this.persistPosition();
    }

    this.wireEvents();
    void this.loadRenderer();
    return this.win;
  }

  private async loadRenderer(): Promise<void> {
    if (this.win === null) return;
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl !== undefined) {
      await this.win.loadURL(`${devUrl}/overlay.html`);
    } else {
      await this.win.loadFile(join(import.meta.dirname, '../renderer/overlay.html'));
    }
    this.win.show();
  }

  private wireEvents(): void {
    const win = this.win;
    if (win === null) return;

    win.on('moved', () => this.schedulePersist());

    // Renderer stops its animation loop when not visible (RULE 4).
    win.on('hide', () => this.setVisible(false));
    win.on('show', () => this.setVisible(true));
    win.on('minimize', () => this.setVisible(false));
    win.on('restore', () => this.setVisible(true));

    // Suspend and lock are the two states where an animating overlay is pure
    // wasted battery.
    powerMonitor.on('suspend', () => this.setVisible(false));
    powerMonitor.on('resume', () => this.setVisible(true));
    powerMonitor.on('lock-screen', () => this.setVisible(false));
    powerMonitor.on('unlock-screen', () => this.setVisible(true));

    // Monitor hot-plug and resolution changes must never strand the mascot.
    screen.on('display-removed', () => this.reclamp());
    screen.on('display-added', () => this.reclamp());
    screen.on('display-metrics-changed', () => this.reclamp());

    win.on('closed', () => {
      this.win = null;
    });
  }

  private setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.win?.webContents.send('overlay:visibility', visible);
  }

  /** Re-run placement against the current display layout. */
  reclamp(): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;

    const { x, y, width, height } = win.getBounds();
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const current = displayContaining({ x, y }, displays);

    const placement = resolvePlacement(
      { x, y, displayId: current?.id ?? screen.getPrimaryDisplay().id },
      { width, height },
      displays,
      screen.getPrimaryDisplay().id,
    );

    if (placement.relocated) {
      win.setPosition(placement.position.x, placement.position.y);
      this.persistPosition();
    }
  }

  /**
   * Move by a delta in screen pixels, clamped to whichever display the mascot
   * currently sits on. Called from the renderer while dragging.
   */
  moveBy(dx: number, dy: number): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;

    const { x, y, width, height } = win.getBounds();
    const target: Point = { x: x + Math.round(dx), y: y + Math.round(dy) };

    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const host = displayContaining(target, displays) ?? displayContaining({ x, y }, displays);

    const placement = resolvePlacement(
      { ...target, displayId: host?.id ?? screen.getPrimaryDisplay().id },
      { width, height },
      displays,
      screen.getPrimaryDisplay().id,
    );

    win.setPosition(placement.position.x, placement.position.y);
    this.schedulePersist();
  }

  /**
   * Toggle click-through. Called on pointer enter/leave over the mascot so
   * clicks on empty pixels still reach whatever is behind the overlay.
   */
  setInteractive(interactive: boolean): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  private schedulePersist(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistPosition();
    }, SAVE_DEBOUNCE_MS);
  }

  private persistPosition(): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;

    const { x, y } = win.getBounds();
    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const host = displayContaining({ x, y }, displays);
    this.callbacks.onPositionChanged({
      x,
      y,
      displayId: host?.id ?? screen.getPrimaryDisplay().id,
    });
  }

  send(channel: string, payload: unknown): void {
    if (this.win === null || this.win.isDestroyed()) return;
    this.win.webContents.send(channel, payload);
  }

  /**
   * Run `callback` once the renderer has loaded.
   *
   * Anything pushed before this is dropped on the floor — the renderer has
   * not subscribed yet — which would silently lose the greeting. The small
   * extra delay covers React mounting and attaching its listeners.
   */
  whenReady(callback: () => void, settleMs = 350): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;

    const fire = (): void => {
      const t = setTimeout(callback, settleMs);
      t.unref?.();
    };

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', fire);
    } else {
      fire();
    }
  }

  get browserWindow(): BrowserWindow | null {
    return this.win;
  }

  setPaused(paused: boolean): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;
    if (paused) win.hide();
    else win.show();
  }

  destroy(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.win?.destroy();
    this.win = null;
  }
}
