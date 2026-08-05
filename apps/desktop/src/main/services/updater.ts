/**
 * Silent background updates, announced once they have happened.
 *
 * Downloads in the background and installs when the user closes the app, so a
 * running session is never swapped underneath them. The decisions live in
 * `updater-policy.ts` where they can be tested; this file is only the wiring to
 * electron-updater and is deliberately dull.
 *
 * **The notice goes through the event bus, not a native notification.**
 * `checkForUpdatesAndNotify()` — which every tutorial reaches for — raises an OS
 * toast. Mochi has one door to attention and the governor owns it: quiet hours,
 * Do Not Disturb, the hourly budget and the bubble queue all live behind that
 * door. A native toast is a second door that ignores every one of them, and an
 * update notice is the least urgent thing in the app.
 */

import { app } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { makeEvent, summariseUpdateFailure, type EventBus, type UpdateStatus } from '@mochi/core';
import {
  CHECK_INTERVAL_MS,
  describeReadyUpdate,
  shouldCheck,
  updateSubject,
} from './updater-policy.js';

export class UpdaterService {
  private lastCheckedAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private wired = false;
  private state: UpdateStatus = app.isPackaged ? { state: 'idle' } : { state: 'unsupported' };
  private readonly watchers = new Set<(status: UpdateStatus) => void>();

  constructor(private readonly bus: EventBus) {}

  status(): UpdateStatus {
    return this.state;
  }

  /** Fires on every transition, so the settings panel never has to poll. */
  onChange(listener: (status: UpdateStatus) => void): () => void {
    this.watchers.add(listener);
    return () => this.watchers.delete(listener);
  }

  /**
   * Check because a person asked, ignoring the six-hour interval.
   *
   * The interval exists to stop the app hammering GitHub on its own schedule.
   * It has no business overruling someone who has opened Settings and pressed
   * the button — and applying it there is how "nothing happened when I clicked"
   * becomes the new invisible failure.
   */
  checkNow(): UpdateStatus {
    if (!app.isPackaged) return this.state;
    this.wire();
    this.run();
    return this.state;
  }

  /**
   * Quit and apply what has been downloaded.
   *
   * `autoInstallOnAppQuit` already does this on a normal quit, but closing the
   * settings window does not quit Mochi — the overlay lives in the tray — so
   * without this button the only way to finish an update is to know that, find
   * the tray icon and choose Quit. That is not something a user should have to
   * work out from the outside.
   */
  installNow(): void {
    if (this.state.state !== 'ready') return;
    // Leaves `before-quit` intact, so the schedulers and the database still
    // close in order.
    autoUpdater.quitAndInstall();
  }

  private moveTo(next: UpdateStatus): void {
    this.state = next;
    for (const watcher of this.watchers) watcher(next);
  }

  private fail(error: unknown): void {
    const raw = error instanceof Error ? error.message : String(error);
    console.error('[updater] failed:', raw);
    this.moveTo({ state: 'failed', reason: summariseUpdateFailure(raw), at: Date.now() });
  }

  /**
   * Wire the listeners once, check now, then keep checking.
   *
   * The repeat is the point. `start()` was called once at boot and nothing ever
   * called it again, so `CHECK_INTERVAL_MS` was defined, respected by
   * `shouldCheck`, and driven by nothing — anyone who left Mochi running for days
   * never learned an update existed. A companion is meant to stay open; "restart
   * to find out there was an update" is the wrong shape for one.
   */
  start(): void {
    if (!app.isPackaged) {
      console.log('[updater] not checking — not a packaged build');
      return;
    }

    this.wire();
    this.check();

    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    // Ambient bookkeeping must never be the reason the process stays alive.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Ask GitHub, if enough time has passed.
   *
   * Separate from `wire()` because electron-updater's emitter is global: calling
   * the setup twice would stack a second copy of every listener, and one
   * downloaded update would then announce itself twice.
   */
  private check(): void {
    // An update already on disk is the end of the road: there is nothing left
    // to discover, and asking again would move the status off `ready` — taking
    // the "Restart and install" button with it and leaving someone who left
    // Mochi open for six hours with a downloaded update and no way to see it.
    if (this.state.state === 'ready') return;

    const decision = shouldCheck({
      packaged: app.isPackaged,
      lastCheckedAt: this.lastCheckedAt,
      now: Date.now(),
    });
    if (!decision.check) {
      console.log(`[updater] not checking — ${decision.because}`);
      return;
    }
    this.run();
  }

  /** Ask, unconditionally. The interval is decided by the callers above. */
  private run(): void {
    this.lastCheckedAt = Date.now();
    this.moveTo({ state: 'checking' });
    void autoUpdater.checkForUpdates().catch((error: unknown) => this.fail(error));
  }

  private wire(): void {
    if (this.wired) return;
    this.wired = true;

    autoUpdater.logger = log;
    // A failed update that leaves no trace is the worst version of this, and the
    // user is the only one who can send us the log.
    log.transports.file.level = 'info';

    autoUpdater.autoDownload = true;
    // Installs on quit rather than mid-session. Replacing the binary under a
    // running app is how a tracked session gets lost.
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      console.log(`[updater] ${info.version} available, downloading in the background`);
      // Zero rather than nothing: `download-progress` does not fire until the
      // first chunk lands, and on a fast link that gap is long enough for the
      // panel to sit on "Checking…" while the download is already running.
      this.moveTo({ state: 'downloading', version: info.version, percent: 0 });
    });

    autoUpdater.on('download-progress', (progress) => {
      const current = this.state;
      // Keyed off the version already recorded, because the progress payload
      // does not carry one.
      if (current.state !== 'downloading') return;
      this.moveTo({ ...current, percent: progress.percent });
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[updater] already up to date');
      this.moveTo({ state: 'current', checkedAt: Date.now() });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[updater] ${info.version} downloaded, will install on quit`);
      this.moveTo({ state: 'ready', version: info.version });
      // Through the governor like everything else. Low priority: this can wait
      // for a moment when the user is not busy, and it is still true later.
      this.bus.emit(
        makeEvent({
          source: 'system',
          kind: 'update-ready',
          at: Date.now(),
          subject: updateSubject(info.version),
          priority: 'low',
          text: describeReadyUpdate(info.version),
        }),
      );
    });

    autoUpdater.on('error', (error) => {
      // Never thrown onward. A broken update feed must not take the app with it,
      // and the user can keep working on the version they have. It is recorded
      // rather than only logged: a failure nobody can see is the reason this
      // whole surface exists.
      this.fail(error);
    });
  }
}
