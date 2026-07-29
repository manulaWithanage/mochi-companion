/**
 * Mochi main process entry.
 *
 * V1 contains no AI: no LLM router, no BYOK vault, no Google integration,
 * no MCP. See CLAUDE_KICKOFF_PROMPT.md.
 */

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import {
  BRIEF_SESSION_MS,
  BUBBLE_TTL_LONG_MS,
  BUBBLE_TTL_MS,
  composeMessage,
  DEFAULT_GOVERNOR_CONFIG,
  elapsedMs,
  EventBus,
  InMemoryStorageAdapter,
  InterruptionGovernor,
  makeEvent,
  type EventPriority,
  type EventSource,
  type MessageKind,
  type StorageAdapter,
} from '@mochi/core';

import { SqliteStorageAdapter } from './storage/sqlite-adapter.js';
import { SettingsStore } from './storage/settings-store.js';
import { TimerService } from './services/timer-service.js';
import { MascotService } from './services/mascot-service.js';
import { OverlayWindow } from './windows/overlay.js';
import { SetupWindow } from './windows/setup.js';
import { MochiTray } from './tray.js';
import { RoutineService } from './services/routine-service.js';
import { registerIpc } from './ipc.js';

interface SayOptions {
  readonly durationMs?: number;
  readonly subject?: string;
  readonly source?: EventSource;
  readonly priority?: EventPriority;
  /** The user asked for this directly — a click, a hotkey, launching the app. */
  readonly userInitiated?: boolean;
}

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
    onToggleDoNotDisturb: (dnd) => {
      settings.update({ doNotDisturb: dnd });
      tray.rebuild();
    },
    onStopTimer: () => {
      void timer.stop().then(() => mascot.evaluate());
    },
  });

  const governor = new InterruptionGovernor({
    ...DEFAULT_GOVERNOR_CONFIG,
    doNotDisturb: settings.get().doNotDisturb,
  });
  const bus = new EventBus();

  // Mochi's first unprompted behaviour. Everything it emits still has to get
  // past the governor above — routines are a source, not a shortcut.
  const routines = new RoutineService(bus, {
    getWorkHours: () => settings.get().workHours,
    isPaused: () => settings.get().paused,
  });

  registerIpc({ timer, mascot, settings, storage, overlay, setup, governor });

  /**
   * The only path to the user's attention.
   *
   * Everything — including user-initiated messages — goes through the
   * governor. User-initiated events carry the flag and are allowed
   * unconditionally, but they still pass through here so there is exactly
   * one door rather than a governed path and an ungoverned one.
   */
  bus.subscribe((event) => {
    const decision = governor.admit(event, {
      now: Date.now(),
      // Best-effort. Reliable cross-platform fullscreen detection needs a
      // native module, and this project deliberately has none. The overlay's
      // own visibility is the closest honest proxy: hidden, minimised,
      // suspended or screen-locked all mean nothing should be said.
      fullscreenActive: !overlay.isVisible,
    });

    if (decision.kind === 'allow') {
      overlay.send('bubble:show', {
        text: event.text,
        ttlMs: event.userInitiated === true ? BUBBLE_TTL_LONG_MS : BUBBLE_TTL_MS,
        subject: event.subject,
      });
      return;
    }

    if (decision.kind === 'defer') {
      // Re-offer once. It goes through the governor again on arrival, so the
      // spacing rules still apply and deferred events cannot burst.
      const wait = Math.max(0, decision.until - Date.now());
      const retry = setTimeout(() => bus.emit(event), wait);
      retry.unref?.();
    }
  });

  /** Compose a templated message and put it on the bus. */
  const say = (kind: MessageKind, opts: SayOptions = {}): void => {
    bus.emit(
      makeEvent({
        source: opts.source ?? 'system',
        kind,
        at: Date.now(),
        subject: opts.subject ?? kind,
        priority: opts.priority ?? 'normal',
        text: composeMessage(kind, {
          assistantName: settings.get().assistantName,
          now: new Date(),
          ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
        }),
        ...(opts.userInitiated === true ? { userInitiated: true } : {}),
      }),
    );
  };

  // Push state changes to whichever windows are open.
  let wasRunning = false;
  timer.onChange((snapshot) => {
    overlay.send('timer:changed', snapshot);
    setup.send('timer:changed', snapshot);
    tray.rebuild();

    if (snapshot.running && !wasRunning) {
      say('timer-started', { source: 'timer', subject: 'timer', userInitiated: true });
      if (snapshot.session !== null) routines.onSessionStarted(snapshot.session.startedAt);
    } else if (!snapshot.running && wasRunning) {
      routines.onSessionStopped();
      // The session just closed; report what it was worth. A misclick gets a
      // plain acknowledgement instead of hollow congratulation.
      void storage.listSessions({ limit: 1 }).then((recent) => {
        const last = recent[0];
        const ms = last === undefined ? 0 : elapsedMs(last, Date.now());
        say(ms < BRIEF_SESSION_MS ? 'timer-stopped-brief' : 'timer-stopped', {
          durationMs: ms,
          source: 'timer',
          subject: 'timer',
          userInitiated: true,
        });
      });
    }
    wasRunning = snapshot.running;
  });
  mascot.onChange((state) => overlay.send('mascot:state', state));
  settings.onChange((next) => {
    governor.configure({ doNotDisturb: next.doNotDisturb });
    routines.replan();
    setup.send('settings:changed', next);
    overlay.send('settings:changed', next);
  });

  await timer.restore();
  mascot.start();
  routines.start();

  overlay.create(settings.get().overlayPosition);
  if (settings.get().paused) overlay.setPaused(true);
  tray.create();

  // First run opens the 3-step setup window; afterwards Mochi just appears.
  const firstRun = !settings.get().setupCompleted;
  if (firstRun) {
    setup.open();
  }

  // Say hello once the renderer is actually listening. Launching the app is a
  // user action, so this does not need the governor.
  overlay.whenReady(() => {
    if (settings.get().paused) return;
    // Launching the app is a user action, so the greeting is user-initiated.
    say(firstRun ? 'welcome' : 'greeting', { subject: 'greeting', userInitiated: true });
  });

  app.on('second-instance', () => setup.open());

  app.on('before-quit', () => {
    routines.stop();
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
