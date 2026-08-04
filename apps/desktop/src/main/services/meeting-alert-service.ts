/**
 * Tells the user a meeting is about to start.
 *
 * Mochi could see the calendar and never mentioned it. The Calendar tab and the
 * Coming up card both rendered events, but nothing emitted one to the bus, so the
 * companion never spoke about a meeting at all.
 *
 * **Almost none of this is new logic, on purpose.** `planMeetingAlerts` already
 * decided the lead time, the minimum notice and what to say; `Scheduler` already
 * handles the hard parts of firing a local timer. This is the wire between them.
 *
 * The two-mechanism split is the reason it works, and the scheduler's own header
 * says it best: a 15-minute poll can never deliver a 5-minute warning. The feed
 * poll keeps a cache fresh; timers computed from that cache do the alerting. So
 * the poll interval bounds only how quickly a *newly created or moved* meeting
 * becomes known — it does not blunt the accuracy of an alert for a meeting
 * already in the cache. That was recorded as an open question blocking this work;
 * it was already answered by the design.
 *
 * The honest limit that remains: a meeting created, moved or cancelled inside the
 * last 15 minutes is alerted from stale data, or not at all.
 */

import {
  CALENDAR_SUBJECT_PREFIX,
  makeEvent,
  planMeetingAlerts,
  Scheduler,
  systemTimers,
  type CalendarEvent,
  type EventBus,
  type Timers,
} from '@mochi/core';

/** Every timer this service owns, so a re-plan can replace the whole set. */
const NAMESPACE = `${CALENDAR_SUBJECT_PREFIX}alert:`;

export class MeetingAlertService {
  private readonly scheduler: Scheduler;
  /** Subject → event, so an action on the bubble can find its meeting. */
  private readonly bySubject = new Map<string, CalendarEvent>();

  /**
   * `openExternal` and `timers` are injected rather than imported.
   *
   * Not ceremony: importing `electron` at module scope would make this file
   * unloadable in a test, and the whole point of `Scheduler` taking a `Timers` is
   * that every branch is reachable without waiting for a real clock.
   */
  constructor(
    private readonly bus: EventBus,
    private readonly getEvents: () => readonly CalendarEvent[],
    private readonly openExternal: (url: string) => void,
    timers: Timers = systemTimers,
  ) {
    this.scheduler = new Scheduler(
      {
        onFire: (event, reason) => {
          if (reason === 'missed') {
            // Overdue by more than the scheduler's threshold — the laptop was
            // asleep through it. Said out loud rather than dropped in silence.
            console.log(`[meeting] skipped "${event.subject}" — fired too late to be useful`);
            return;
          }
          this.bus.emit(event);
        },
      },
      timers,
    );
  }

  /**
   * Re-plan every alert from what the calendar currently knows.
   *
   * Safe to call on every sync. `replaceNamespace` cancels timers that are no
   * longer planned, so a deleted or moved meeting stops alerting without this
   * service tracking deletions itself.
   */
  reconcile(now = Date.now()): void {
    const alerts = planMeetingAlerts(this.getEvents(), now);
    this.bySubject.clear();

    const items = alerts.map((alert) => {
      this.bySubject.set(alert.subject, alert.event);
      return {
        key: alert.key,
        at: alert.at,
        event: makeEvent({
          source: 'calendar' as const,
          kind: 'meeting-soon',
          at: alert.at,
          subject: alert.subject,
          priority: 'high' as const,
          text: alert.text,
          // Scheduled: the user put the meeting in their calendar, not a request
          // to be told at this instant. So Do Not Disturb silences it.
          origin: 'scheduled' as const,
          /*
           * Deliberately not `recurring`. This instance happens once and then is
           * gone, so quiet hours lets it through — a 07:30 meeting is worth
           * hearing about at 07:25 even inside a default quiet window.
           *
           * And the part that matters most: it expires when the meeting starts.
           * A deferral for a fullscreen app or the minimum gap must never turn a
           * warning into an announcement that something already began, and the
           * governor already drops anything past `expiresAt`.
           */
          expiresAt: alert.event.startsAt,
        }),
      };
    });

    this.scheduler.replaceNamespace(NAMESPACE, items);
  }

  /** The validated join link for a meeting alert, if the invite carried one. */
  conferenceUrlFor(subject: string): string | null {
    return this.bySubject.get(subject)?.conferenceUrl ?? null;
  }

  /**
   * Open a meeting's join link.
   *
   * The URL was validated when the invite was parsed — https only, against a
   * fixed host allowlist, null rather than a best guess. The scheme is checked
   * again here because this is the moment it becomes an action on the user's
   * machine, and a calendar invite is attacker-controlled input.
   */
  join(subject: string): void {
    const url = this.conferenceUrlFor(subject);
    if (url === null) return;
    if (!url.startsWith('https://')) return;
    this.openExternal(url);
  }

  /** Diagnostics. */
  get plannedCount(): number {
    return this.bySubject.size;
  }

  stop(): void {
    this.scheduler.replaceNamespace(NAMESPACE, []);
    this.bySubject.clear();
  }
}
