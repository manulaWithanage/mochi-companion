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
import { makeEvent, type EventBus } from '@mochi/core';
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

  constructor(private readonly bus: EventBus) {}

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
    const decision = shouldCheck({
      packaged: app.isPackaged,
      lastCheckedAt: this.lastCheckedAt,
      now: Date.now(),
    });
    if (!decision.check) {
      console.log(`[updater] not checking — ${decision.because}`);
      return;
    }

    this.lastCheckedAt = Date.now();
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      console.error('[updater] check failed:', error instanceof Error ? error.message : error);
    });
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
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[updater] already up to date');
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[updater] ${info.version} downloaded, will install on quit`);
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
      // and the user can keep working on the version they have.
      console.error('[updater] check failed:', error instanceof Error ? error.message : error);
    });
  }
}
