/**
 * Mochi main process entry.
 *
 * No Google integration and no MCP yet. The LLM layer is being added now
 * (M2) — starting with Ollama detection, which gives every AI feature a
 * zero-key path. See ROADMAP.md.
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
import { UserRoutinesVault } from './storage/user-routines-vault.js';
import { TimerService } from './services/timer-service.js';
import { MascotService } from './services/mascot-service.js';
import { OverlayWindow } from './windows/overlay.js';
import { SetupWindow } from './windows/setup.js';
import { MochiTray } from './tray.js';
import { RoutineService } from './services/routine-service.js';
import { UserRoutineScheduler } from './services/user-routine-scheduler.js';
import { LlmService } from './services/llm-service.js';
import { KeyVault } from './storage/key-vault.js';
import { ProviderService } from './services/provider-service.js';
import { LlmClient } from './services/llm-client.js';
import { GoogleService } from './services/google-service.js';
import { GmailManager } from './services/gmail-manager.js';
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

/**
 * Log where the app's data actually lives.
 *
 * `app.getPath('userData')` is derived from `app.getName()`, which reads
 * `productName` from package.json. Changing that name silently relocates the
 * database, settings and every encrypted vault — it once split this app's
 * history across two folders, and the only symptom was a migration that
 * appeared not to have run.
 *
 * One line at startup makes that visible immediately instead of days later.
 */
function logDataLocation(): void {
  console.log(`[paths] name=${app.getName()} userData=${app.getPath('userData')}`);
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
  const userRoutines = new UserRoutinesVault();
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
    listTasks: () => storage.listTasks(),
  });

  const userRoutineScheduler = new UserRoutineScheduler(bus, userRoutines, settings, overlay);
  userRoutineScheduler.start();

  const google = new GoogleService(join(app.getPath('userData'), 'google.enc.json'));
  // Local base URLs are a host and port, not a secret, so they live in
  // settings — visible and fixable — rather than in the encrypted vault.
  const llm = new LlmService(new KeyVault(), new ProviderService(), {
    get: () => settings.get().localEndpoints,
    set: (localEndpoints) => {
      settings.update({ localEndpoints });
    },
  });
  const llmClient = new LlmClient(llm);
  const gmailManager = new GmailManager(llmClient, settings, storage);
  gmailManager.onInboxChanged((account, newEmails) => {
    setup.send('gmail:inboxChanged', {
      account,
      newEmailCount: newEmails.length,
      status: gmailManager.syncStatus,
    });
  });
  gmailManager.onSyncStatus((status) => setup.send('gmail:syncStatus', status));

  const notifyTasks = async () => {
    const tasks = await storage.listTasks();
    setup.send('tasks:changed', tasks);
    // Ticking the last item should remove the nudge, not leave Mochi asking
    // about an empty list.
    void routines.scheduleTaskNudge();
    return tasks;
  };

  google.onChange((status) => setup.send('google:changed', status));

  registerIpc({
    google: {
      status: () => google.status(),
      openStep: (url) => google.openStep(url),
      connect: (clientId) => google.connect(clientId),
      disconnect: () => google.disconnect(),
    },
    notifyTasks,
    timer,
    mascot,
    settings,
    userRoutines,
    userRoutineScheduler,
    storage,
    overlay,
    setup,
    governor,
    llm: {
      status: () => llm.status(),
      saveKey: (rawKey) => llm.saveKey(rawKey),
      saveAzureKey: (resourceName, deploymentName, apiKey) =>
        llm.saveAzureKey(resourceName, deploymentName, apiKey),
      forgetKey: (provider) => llm.forgetKey(provider),
      setDailyTokenCap: (cap) => llm.setDailyTokenCap(cap),
      setLocalEndpoint: (provider, baseUrl) => llm.setLocalEndpoint(provider, baseUrl),
      refresh: () => llm.refresh(),
      // One real call, so the user can confirm the chain works end to end
      // rather than discovering it is broken during a briefing.
      test: async () => {
        const result = await llmClient.generate({
          task: 'phrase',
          system: 'You are Mochi, a small desktop companion. Reply in one short sentence.',
          prompt: 'Say hello and mention you are ready to help.',
        });
        if (result.ok) {
          return { ok: true, text: result.text, model: result.model, tokens: result.tokens };
        }
        // Test is a diagnostic, so it shows the provider's own error. Nothing
        // else does — the mascot only ever gets `reason`.
        return { ok: false, text: result.detail ?? result.reason };
      },
    },
    gmail: gmailManager,
  });

  llm.onChange((status) => setup.send('llm:changed', status));

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
  gmailManager.start();

  // Zero-key onboarding: if Ollama is running, every AI feature works with
  // nothing pasted and no account. Fire-and-forget — the mascot must never
  // wait on a network call to appear.
  void llm.initialize();

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
    void gmailManager.stop();
    userRoutineScheduler.stop();
    routines.stop();
    mascot.stop();
    tray.destroy();
    void storage.close();
  });
}

app.whenReady().then(() => {
  logDataLocation();

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
