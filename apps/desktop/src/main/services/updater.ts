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
import { describeReadyUpdate, shouldCheck, updateSubject } from './updater-policy.js';

export class UpdaterService {
  private lastCheckedAt: number | null = null;

  constructor(private readonly bus: EventBus) {}

  start(): void {
    const decision = shouldCheck({
      packaged: app.isPackaged,
      lastCheckedAt: this.lastCheckedAt,
      now: Date.now(),
    });
    if (!decision.check) {
      console.log(`[updater] not checking — ${decision.because}`);
      return;
    }

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

    this.lastCheckedAt = Date.now();
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      console.error('[updater] check failed:', error instanceof Error ? error.message : error);
    });
  }
}
