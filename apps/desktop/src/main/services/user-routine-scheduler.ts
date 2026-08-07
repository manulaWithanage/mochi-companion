/**
 * User Routine Scheduler Engine
 *
 * Runs on a 10-second local system clock ticker. Compares current local time
 * (HH:MM) and local day of week against user routines in UserRoutinesVault.
 * Emits speech bubble events and glides Mochi to center screen if enabled.
 */

import { makeEvent, type EventBus, type EventOrigin, type RoutineDay } from '@mochi/core';
import type { UserRoutinesVault } from '../storage/user-routines-vault.js';
import type { SettingsStore } from '../storage/settings-store.js';

const DAY_MAP: readonly RoutineDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export class UserRoutineScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly firedKeys = new Set<string>();

  constructor(
    private readonly bus: EventBus,
    private readonly userRoutines: UserRoutinesVault,
    private readonly settings: SettingsStore,
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

  /**
   * @param origin `scheduled` for a routine falling due, `interactive` for the
   * Test button.
   *
   * The difference is not cosmetic. A real routine is rationed: quiet hours
   * defer it, Do Not Disturb silences it, and missing tonight's costs nothing
   * because it comes round again tomorrow. **A test is a direct request to see
   * what an alert looks like**, and rationing it means the button does nothing
   * at all after 8pm with no explanation — which is how somebody concludes the
   * feature is broken. It was emitted as `scheduled` and was dropped exactly
   * that way.
   */
  triggerAlert(
    title?: string,
    message?: string,
    origin: EventOrigin = 'scheduled',
    routineId?: string,
  ): void {
    const text = message || `${title || 'Routine Alert'}! Time for your scheduled routine.`;
    // Keyed by routine, the way task reminders are keyed by task. The subject
    // used to be `user-routine-alert:${Date.now()}` — fresh on every fire — so
    // governor.dismiss(subject) could never suppress the routine again, and
    // waving one away meant nothing. The Test button has no routine and keeps
    // its own stable subject; it emits as `interactive`, which the governor
    // allows before it ever consults dismissals.
    const subject = routineId !== undefined ? `user-routine:${routineId}` : 'user-routine-test';
    this.bus.emit(
      makeEvent({
        source: 'routine',
        kind: 'break',
        at: Date.now(),
        // Explicit, because the default id is `${source}:${kind}:${at}` — two
        // routines firing on the same tick share a millisecond, and the
        // governor would dedupe the second into silence.
        id: `${subject}:${Date.now()}`,
        subject,
        priority: 'high',
        text,
        origin,
        recurring: true,
      }),
    );
    // The centre-screen entrance is *not* started here.
    //
    // It used to be, immediately after this emit, which meant the governor's
    // verdict applied to the bubble and not to the performance. Outside work
    // hours Mochi vanished, reappeared centre screen in a puff of smoke, held
    // an alert face for six seconds and said nothing — quiet hours suppressed
    // the message and let the interruption through.
    //
    // It now runs from the bubble's own `present` callback in index.ts, so one
    // decision covers both and a deferred alert stays entirely silent.
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
      // The whole body is guarded. The vault and the IPC boundary both
      // validate now, but this tick runs every ten seconds for as long as the
      // app lives — one malformed routine slipping through must skip itself,
      // not turn the loop into a permanent crash-and-retry.
      try {
        if (!routine.enabled) continue;
        if (!Array.isArray(routine.days) || !routine.days.includes(dayKey)) continue;

        const rawTimes =
          Array.isArray(routine.times) && routine.times.length > 0 ? routine.times : [routine.time];
        const normalizedTimes = rawTimes
          .filter((t): t is string => typeof t === 'string')
          .map((t) => {
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
        this.triggerAlert(routine.title, text, 'scheduled', routine.id);
      } catch (error) {
        console.error('[user-routine] skipped a malformed routine:', error);
      }
    }
  }
}
