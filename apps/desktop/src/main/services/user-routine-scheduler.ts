/**
 * User Routine Scheduler Engine
 *
 * Runs on a 15-second local system clock ticker. Compares current local time
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
    // Check local time every 15 seconds
    this.timer = setInterval(() => this.check(), 15_000);
    // Initial immediate check
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
        subject: `user-routine-test:${Date.now()}`,
        priority: 'high',
        text,
        userInitiated: true,
      }),
    );

    if (this.settings.get().centerScreenAlerts !== false) {
      void this.overlay.animateToCenterAndBack(7500);
    }
  }

  private check(): void {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const currentHHMM = `${hours}:${mins}`;
    const dayKey = DAY_MAP[now.getDay()]!;
    const dateKey = now.toISOString().slice(0, 10);

    const routines = this.userRoutines.list();

    for (const routine of routines) {
      if (!routine.enabled) continue;
      if (!routine.days.includes(dayKey)) continue;

      const scheduledTimes = routine.times && routine.times.length > 0 ? routine.times : [routine.time];
      if (!scheduledTimes.includes(currentHHMM)) continue;

      const firedKey = `${routine.id}:${dateKey}:${currentHHMM}`;
      if (this.firedKeys.has(firedKey)) continue;

      this.firedKeys.add(firedKey);

      const icon = routine.icon || '⏰';
      const text = routine.reminderMessage || `${icon} ${routine.title}: Time for your routine!`;

      this.triggerAlert(routine.title, text);
    }
  }
}
