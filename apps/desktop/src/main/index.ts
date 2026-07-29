/**
 * Mochi main process entry.
 *
 * V1 contains no AI: no LLM router, no BYOK vault, no Google integration,
 * no MCP. See CLAUDE_KICKOFF_PROMPT.md.
 */

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { InMemoryStorageAdapter, type StorageAdapter } from '@mochi/core';
import { SqliteStorageAdapter } from './storage/sqlite-adapter.js';
import { SettingsStore } from './storage/settings-store.js';
import { TimerService } from './services/timer-service.js';
import { MascotService } from './services/mascot-service.js';
import { OverlayWindow } from './windows/overlay.js';
import { SetupWindow } from './windows/setup.js';
import { MochiTray } from './tray.js';
import { registerIpc } from './ipc.js';

// Single instance: two mascots writing the same database would corrupt
// session state, and two overlays is nonsense anyway.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function openStorage(): StorageAdapter {
  try {
    return new SqliteStorageAdapter(join(app.getPath('userData'), 'mochi.db'));
  } catch (error) {
    // Degrade to this-session-only tracking rather than refusing to start.
    console.error('[storage] SQLite unavailable, falling back to memory:', error);
    return new InMemoryStorageAdapter();
  }
}

async function bootstrap(): Promise<void> {
  const settings = new SettingsStore();
  const storage = openStorage();
  const timer = new TimerService(storage);

  const mascot = new MascotService({
    isTimerRunning: () => timer.isRunning,
    getWorkHours: () => settings.get().workHours,
  });

  const overlay = new OverlayWindow({
    onPositionChanged: (position) => settings.update({ overlayPosition: position }),
  });
  const setup = new SetupWindow();

  const tray = new MochiTray(timer, settings, {
    onOpenSettings: () => setup.open(),
    onTogglePaused: (paused) => {
      settings.update({ paused });
      overlay.setPaused(paused);
      tray.rebuild();
    },
    onStopTimer: () => {
      void timer.stop().then(() => mascot.evaluate());
    },
  });

  registerIpc({ timer, mascot, settings, storage, overlay, setup });

  // Push state changes to whichever windows are open.
  timer.onChange((snapshot) => {
    overlay.send('timer:changed', snapshot);
    setup.send('timer:changed', snapshot);
    tray.rebuild();
  });
  mascot.onChange((state) => overlay.send('mascot:state', state));
  settings.onChange((next) => {
    setup.send('settings:changed', next);
    overlay.send('settings:changed', next);
  });

  await timer.restore();
  mascot.start();

  overlay.create(settings.get().overlayPosition);
  if (settings.get().paused) overlay.setPaused(true);
  tray.create();

  // First run opens the 3-step setup window; afterwards Mochi just appears.
  if (!settings.get().setupCompleted) {
    setup.open();
  }

  app.on('second-instance', () => setup.open());

  app.on('before-quit', () => {
    mascot.stop();
    tray.destroy();
    void storage.close();
  });
}

app.whenReady().then(() => {
  // Harden against a compromised renderer: block navigation to anywhere that
  // is not our own bundle, and force external links into the real browser.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const devUrl = process.env['ELECTRON_RENDERER_URL'];
      const allowed = devUrl !== undefined && url.startsWith(devUrl);
      if (!allowed && !url.startsWith('file://')) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  void bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void bootstrap();
  });
});

// The overlay lives in the tray; closing the settings window must not quit.
app.on('window-all-closed', () => {
  // Intentionally empty.
});
