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
  type EventOrigin,
  type EventPriority,
  type EventSource,
  type ActivityCategory,
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
import { TaskReminderScheduler } from './services/task-reminder-scheduler.js';
import { BubbleActions, actionsForEvent } from './services/bubble-actions.js';
import { BubbleQueue } from './services/bubble-queue.js';
import { MeetingAlertService } from './services/meeting-alert-service.js';
import { LlmService } from './services/llm-service.js';
import { KeyVault } from './storage/key-vault.js';
import { ProviderService } from './services/provider-service.js';
import { LlmClient } from './services/llm-client.js';
import { GoogleService } from './services/google-service.js';
import { GmailManager } from './services/gmail-manager.js';
import { CalendarService } from './services/calendar-service.js';
import { BriefingService } from './services/briefing-service.js';
import { ActivityService } from './services/activity-service.js';
import { CalendarVault } from './storage/calendar-vault.js';
import { registerIpc } from './ipc.js';

interface SayOptions {
  readonly durationMs?: number;
  readonly subject?: string;
  readonly source?: EventSource;
  readonly priority?: EventPriority;
  /** Why it is raised. Omitted means `unprompted` — full governor treatment. */
  readonly origin?: EventOrigin;
}

// Disable GPU shader disk cache to prevent file lock conflicts on dev restarts on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Single instance: two mascots writing the same database would corrupt
// session state, and two overlays is nonsense anyway.
//
// app.exit() rather than app.quit(). quit() is a *request*: it returns
// immediately, fires before-quit, and lets the rest of this module keep
// running — so a losing instance would go on to open the database, start the
// schedulers and register IPC while it was supposed to be leaving. The
// symptom was a process that lived long enough to be counted but never showed
// a window, which reads exactly like a silent failure to launch.
//
// A losing instance has done nothing yet, so there is nothing to unwind:
// exit(0) stops here and now.
if (!app.requestSingleInstanceLock()) {
  console.log('[startup] another Mochi already holds the single-instance lock — exiting');
  app.exit(0);
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

  const taskReminders = new TaskReminderScheduler(bus, storage, settings, overlay);
  taskReminders.start();

  const bubbleActions = new BubbleActions();
  // A question keeps the floor until it is answered, so a second alert cannot
  // silently replace an unanswered reminder.
  const bubbleQueue = new BubbleQueue((actions) => bubbleActions.offer(actions));

  // A reload takes the bubble off screen without any dismissal reaching main.
  // Without this the queue would wait for an answer to a question nobody can
  // see any more, and every later reminder would be held behind it for ever.
  overlay.onRendererLoad(() => {
    if (bubbleQueue.pendingSubject !== null) {
      console.log(
        `[bubble] overlay reloaded — dropping unanswered "${bubbleQueue.pendingSubject}"`,
      );
    }
    bubbleQueue.clear();
    // Those buttons are gone from the screen, so the ids for them must stop
    // being pressable.
    bubbleActions.clear();
  });

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
  const calendar = new CalendarService(new CalendarVault());
  // Mochi could see the calendar and never mentioned it: nothing emitted a
  // meeting to the bus. Alerts are planned from the cache on every sync, which
  // is why a 15-minute poll can still deliver a 5-minute warning.
  const meetingAlerts = new MeetingAlertService(
    bus,
    () => calendar.cached,
    (url) => shell.openExternal(url).catch(() => undefined),
  );
  calendar.onChange((status) => {
    setup.send('calendar:changed', status);
    meetingAlerts.reconcile();
  });
  calendar.start();
  meetingAlerts.reconcile();

  // The briefing speaks through the bus like everything else, so the governor
  // still decides whether it reaches the user.
  const briefing = new BriefingService(bus, {
    getSettings: () => settings.get(),
    listTasks: () => storage.listTasks(),
    calendarEvents: () => calendar.cached,
    hasCalendar: () => calendar.status().connected,
    phrase: async (prompt) => {
      const result = await llmClient.generate({
        task: 'phrase',
        system: 'You are Mochi, a small desktop companion. Warm and brief. Never add facts.',
        prompt,
      });
      return result.ok ? result.text : null;
    },
    perform: (holdMs) => void overlay.performMagicianAlert(holdMs),
  });
  briefing.start();

  // Off unless the user turned it on. Tracking what someone uses all day is not
  // something to enable for them, however local it stays.
  const activity = new ActivityService(
    storage,
    () => settings.get().activityTracking,
    {
      get: () => settings.get().learnedAppCategories as Readonly<Record<string, ActivityCategory>>,
      set: (learnedAppCategories) => {
        settings.update({ learnedAppCategories });
      },
      // The Tier 1 job from MOCHI_BRAIN.md: fuzzy world knowledge, not
      // arithmetic. Only application names are sent — less than the Activity
      // tab already shows on screen.
      classify: async (prompt) => {
        const result = await llmClient.generate({
          task: 'triage',
          system: 'You classify desktop applications. Reply with JSON only.',
          prompt,
        });
        return result.ok ? result.text : null;
      },
    },
    () => settings.get().trackBrowsingSites,
  );
  if (settings.get().activityTracking) activity.start();
  const gmailManager = new GmailManager(llmClient, settings, storage, bus);
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
    bubbleActions,
    bubbleQueue,
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
    calendar,
    briefing,
    activity,
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
    const isMailReminder = event.source === 'mail' && event.kind === 'reply-reminder';
    if (isMailReminder) {
      console.log(
        `[mail-alert] decision=${decision.kind} priority=${event.priority}` +
          `${decision.kind === 'allow' ? '' : ` reason=${decision.reason}`}`,
      );
    }

    if (decision.kind === 'allow') {
      const mailPreferences = settings.get().gmailAi;
      // For mail reminders, the Gmail-specific toggle is the sole decider.
      // The global centerScreenAlerts flag controls routine/timer alerts only.
      const useCenterEntrance = isMailReminder && mailPreferences.centerScreenAlertsEnabled;
      // What the user can do about this, resolved in main so the renderer only
      // ever receives opaque ids. Registered at presentation rather than here,
      // because a queued bubble's buttons are not on screen yet.
      const actions = actionsForEvent(event, {
        storage,
        undismiss: (subject) => governor.undismiss(subject),
        notifyTasks,
        conferenceUrlFor: (subject) => meetingAlerts.conferenceUrlFor(subject),
        joinMeeting: (subject) => meetingAlerts.join(subject),
      });

      const outcome = bubbleQueue.present({
        subject: event.subject,
        actions,
        present: (offered) => {
          const reached = overlay.send('bubble:show', {
            text: event.text,
            ttlMs: event.origin === 'unprompted' ? BUBBLE_TTL_MS : BUBBLE_TTL_LONG_MS,
            subject: event.subject,
            ...(offered.length > 0 ? { actions: offered } : {}),
            ...(isMailReminder && mailPreferences.alertToneEnabled
              ? {
                  alertTone: 'gentle' as const,
                  alertToneDelayMs: useCenterEntrance ? 1_150 : 0,
                }
              : {}),
          });
          // Only now is it genuinely in front of the user. Confirming on admit
          // or on queue would be confirming something that had not happened.
          if (!reached) return false;
          taskReminders.confirmDelivered(event.subject);
          if (useCenterEntrance) {
            console.log('[mail-alert] presenting with routine magician entrance');
            void overlay.performMagicianAlert(BUBBLE_TTL_MS);
          }
          return true;
        },
      });

      // Said out loud, because a held or dropped alert must not look like a
      // delivered one in the log either.
      if (outcome !== 'shown') {
        console.log(
          `[bubble] ${outcome} "${event.subject}" — waiting on "${bubbleQueue.pendingSubject}"` +
            ` (${bubbleQueue.waitingCount} queued)`,
        );
      }
      return;
    }

    if (decision.kind === 'defer') {
      // Re-offer once. It goes through the governor again on arrival, so the
      // spacing rules still apply and deferred events cannot burst.
      const wait = Math.max(0, decision.until - Date.now());
      const retry = setTimeout(() => bus.emit(event), wait);
      retry.unref?.();
      return;
    }

    // Dropped. Task reminders are held and retried by their scheduler, but
    // everything else ends here, so say so — a discarded interruption should
    // never be invisible in the log.
    console.log(`[governor] dropped "${event.subject}" — ${decision.reason}`);
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
        ...(opts.origin !== undefined ? { origin: opts.origin } : {}),
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
      say('timer-started', { source: 'timer', subject: 'timer', origin: 'interactive' });
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
          origin: 'interactive',
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

  overlay.create(settings.get().overlayPosition, settings.get().alwaysOnTop);
  if (settings.get().paused) overlay.setPaused(true);
  tray.create();

  // First run opens the setup window; in dev mode, also open it automatically.
  const firstRun = !settings.get().setupCompleted;
  const isDev = process.env['ELECTRON_RENDERER_URL'] !== undefined;
  if (firstRun || isDev) {
    setup.open();
  }

  // Say hello once the renderer is actually listening. Launching the app is a
  // user action, so this does not need the governor.
  overlay.whenReady(() => {
    if (settings.get().paused) return;
    // Launching the app is a user action, so the greeting is user-initiated.
    say(firstRun ? 'welcome' : 'greeting', { subject: 'greeting', origin: 'interactive' });
  });

  app.on('second-instance', () => setup.open());

  app.on('before-quit', () => {
    void gmailManager.stop();
    userRoutineScheduler.stop();
    taskReminders.stop();
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
