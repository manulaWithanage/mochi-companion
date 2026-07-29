/**
 * The transparent mascot overlay.
 *
 * RULE 3: the window is exactly mascot-sized and is repositioned by moving
 * the window itself. There is no fullscreen transparent surface and no
 * per-pixel alpha hit testing — the window is almost entirely mascot, so
 * click-through is a simple boolean toggled on hover.
 */

import { BrowserWindow, screen, powerMonitor, type Display } from 'electron';
import { join } from 'node:path';
import {
  displayContaining,
  OVERLAY_COLLAPSED,
  OVERLAY_EXPANDED,
  resolvePlacement,
  type DisplayInfo,
  type OverlayPosition,
  type Point,
  type Size,
} from '@mochi/core';

export const OVERLAY_SIZE = OVERLAY_COLLAPSED;

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

    // Use live bounds, not OVERLAY_COLLAPSED — the window may be expanded
    // around a speech bubble right now.
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
   * Grow the window to make room for a speech bubble, or shrink back.
   *
   * The mascot occupies the bottom-right 200x200 of the window in both
   * sizes, so holding the bottom-right corner fixed keeps the character
   * visually still while the bubble opens up and to the left. Near a screen
   * edge the clamp may shift things slightly — keeping the bubble on screen
   * matters more than the mascot not moving a few pixels.
   */
  setExpanded(expanded: boolean): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;

    const target: Size = expanded ? OVERLAY_EXPANDED : OVERLAY_COLLAPSED;
    const bounds = win.getBounds();
    if (bounds.width === target.width && bounds.height === target.height) return;

    // Anchor the bottom-right corner.
    const desired: Point = {
      x: bounds.x + bounds.width - target.width,
      y: bounds.y + bounds.height - target.height,
    };

    const displays = screen.getAllDisplays().map(toDisplayInfo);
    const host =
      displayContaining({ x: bounds.x, y: bounds.y }, displays) ??
      displayContaining(desired, displays);

    const placement = resolvePlacement(
      { ...desired, displayId: host?.id ?? screen.getPrimaryDisplay().id },
      target,
      displays,
      screen.getPrimaryDisplay().id,
    );

    win.setBounds({
      x: placement.position.x,
      y: placement.position.y,
      width: target.width,
      height: target.height,
    });
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

  /**
   * Record where the *mascot* sits, not where the window box sits.
   *
   * The mascot is anchored to the bottom-right corner, so deriving the
   * position from that corner gives the same answer whether or not a bubble
   * is currently expanding the window. Without this, saving while expanded
   * would drift the mascot up and left a little on every restart.
   */
  private persistPosition(): void {
    const win = this.win;
    if (win === null || win.isDestroyed()) return;

    const bounds = win.getBounds();
    const x = bounds.x + bounds.width - OVERLAY_COLLAPSED.width;
    const y = bounds.y + bounds.height - OVERLAY_COLLAPSED.height;

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
