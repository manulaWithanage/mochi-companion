/**
 * User Routine Scheduler Engine
 *
 * Runs on a 10-second local system clock ticker. Compares current local time
 * (HH:MM) and local day of week against user routines in UserRoutinesVault.
 * Emits speech bubble events and glides Mochi to center screen if enabled.
 */

import { makeEvent, type EventBus, type RoutineDay } from '@mochi/core';
import type { UserRoutinesVault } from '../storage/user-routines-vault.js';
import type { SettingsStore } from '../storage/settings-store.js';
import type { OverlayWindow } from '../windows/overlay.js';

const DAY_MAP: readonly RoutineDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export class UserRoutineScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly firedKeys = new Set<string>();

  constructor(
    private readonly bus: EventBus,
    private readonly userRoutines: UserRoutinesVault,
    private readonly settings: SettingsStore,
    private readonly overlay: OverlayWindow,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.check(), 10_000);
    this.check();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  triggerAlert(title?: string, message?: string): void {
    const text = message || `${title || 'Routine Alert'}! Time for your scheduled routine.`;
    this.bus.emit(
      makeEvent({
        source: 'routine',
        kind: 'break',
        at: Date.now(),
        subject: `user-routine-alert:${Date.now()}`,
        priority: 'high',
        text,
        // Scheduled, and it repeats — so quiet hours defers it and Do Not
        // Disturb silences it. Missing tonight's costs nothing; it fires again
        // tomorrow.
        origin: 'scheduled',
        recurring: true,
      }),
    );

    if (this.settings.get().centerScreenAlerts !== false) {
      void this.overlay.performMagicianAlert(6000);
    }
  }

  private check(): void {
    // Pausing Mochi stopped the built-in routines but not the user's own, which
    // only ever checked `routine.enabled`. Pause is a request for quiet, and it
    // was being honoured by half the things that speak.
    if (this.settings.get().paused === true) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const currentHHMM = `${hours}:${mins}`;
    const dayKey = DAY_MAP[now.getDay()]!;

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const localDateKey = `${yyyy}-${mm}-${dd}`;

    const routines = this.userRoutines.list();

    for (const routine of routines) {
      if (!routine.enabled) continue;
      if (!routine.days.includes(dayKey)) continue;

      const rawTimes = routine.times && routine.times.length > 0 ? routine.times : [routine.time];
      const normalizedTimes = rawTimes.map((t) => {
        const parts = t.split(':');
        if (parts.length !== 2) return t;
        return `${parts[0]!.padStart(2, '0')}:${parts[1]!.padStart(2, '0')}`;
      });

      if (!normalizedTimes.includes(currentHHMM)) continue;

      const firedKey = `${routine.id}:${localDateKey}:${currentHHMM}`;
      if (this.firedKeys.has(firedKey)) continue;

      this.firedKeys.add(firedKey);

      const icon = routine.icon || '⏰';
      const customMsg = routine.reminderMessage?.trim();
      const text = customMsg
        ? `${icon} ${routine.title}: ${customMsg}`
        : `${icon} ${routine.title}: Time for your routine!`;

      console.log(`[user-routine] Firing routine alert for "${routine.title}" at ${currentHHMM}`);
      this.triggerAlert(routine.title, text);
    }
  }
}
