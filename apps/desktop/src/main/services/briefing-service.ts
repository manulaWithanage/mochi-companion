/**
 * Delivers the morning briefing.
 *
 * The moment the project was built toward: at the start of the working day
 * Mochi appears centre screen, says what the day looks like, and goes back to
 * its corner.
 *
 * It speaks through the bus like everything else — the governor still decides
 * whether it reaches the user. There is one door to someone's attention, and a
 * once-a-day feature does not get to bypass it just because it feels
 * important.
 */

import { powerMonitor } from 'electron';
import {
  BRIEFING_SUBJECT,
  briefingPrompt,
  briefingText,
  briefingTimeToday,
  composeBriefing,
  makeEvent,
  Scheduler,
  type Briefing,
  type CalendarEvent,
  type EventBus,
  type MochiSettings,
  type Task,
} from '@mochi/core';

const BRIEFING_PREFIX = 'briefing:';

/** Re-plan often enough that the day rolls over without a restart. */
const REPLAN_INTERVAL_MS = 30 * 60_000;

/**
 * How long Mochi holds centre screen.
 *
 * Long enough to read two sentences without hurrying, short enough that it is
 * not in the way. The magician sequence adds its own entrance and exit either
 * side of this.
 */
const HOLD_MS = 9000;

/**
 * Budget for the model to reword the briefing.
 *
 * Past this it is not worth waiting — the deterministic sentence is already
 * correct, and a briefing that arrives late is a briefing that arrives during
 * something else.
 */
const PHRASING_TIMEOUT_MS = 6000;

export interface BriefingInputs {
  getSettings(): MochiSettings;
  listTasks(): Promise<readonly Task[]>;
  calendarEvents(): readonly CalendarEvent[];
  hasCalendar(): boolean;
  /** Returns null when no model is configured or the call fails. */
  phrase(prompt: string): Promise<string | null>;
  /** The centre-screen entrance. Skipped when the user turned it off. */
  perform(holdMs: number): void;
}

export class BriefingService {
  private readonly scheduler: Scheduler;
  private replanTimer: NodeJS.Timeout | null = null;
  /** Local day key, so the briefing fires once even across re-plans. */
  private deliveredOn: string | null = null;

  constructor(
    private readonly bus: EventBus,
    private readonly inputs: BriefingInputs,
  ) {
    this.scheduler = new Scheduler({
      onFire: (_event, reason) => {
        // A briefing the machine slept through is not worth surfacing late.
        // "Here is your morning" at 4pm is worse than silence, and the
        // scheduler replays missed items on resume by design.
        if (reason === 'missed') return;
        void this.deliver();
      },
    });
  }

  start(): void {
    this.replan();
    this.replanTimer = setInterval(() => this.replan(), REPLAN_INTERVAL_MS);
    this.replanTimer.unref?.();

    // Timers do not advance while suspended, so on resume the scheduler holds
    // timers that still believe they are in the future.
    powerMonitor.on('resume', () => this.scheduler.reconcile());
    powerMonitor.on('unlock-screen', () => this.scheduler.reconcile());
  }

  stop(): void {
    if (this.replanTimer !== null) clearInterval(this.replanTimer);
    this.replanTimer = null;
    // Empty replace is the cancel: the scheduler has no separate clear.
    this.scheduler.replaceNamespace(BRIEFING_PREFIX, []);
  }

  /**
   * Arm today's briefing.
   *
   * Safe to call repeatedly: the same key replaces the previous timer, so a
   * change to work hours takes effect immediately rather than at midnight.
   */
  replan(now: Date = new Date()): void {
    const settings = this.inputs.getSettings();
    const at = briefingTimeToday(now, settings.workHours);

    // Null means the start of the working day has already passed. Nothing is
    // scheduled rather than something being scheduled for tomorrow, because
    // the next replan will arm it once the date rolls over.
    if (at === null) {
      this.scheduler.replaceNamespace(BRIEFING_PREFIX, []);
      return;
    }

    this.scheduler.replaceNamespace(BRIEFING_PREFIX, [
      {
        key: `${BRIEFING_PREFIX}morning`,
        at,
        event: makeEvent({
          source: 'routine',
          kind: 'break',
          at,
          subject: BRIEFING_SUBJECT,
          text: '',
          priority: 'high',
          // Meaningless by mid-morning; let it expire rather than surface late.
          expiresAt: at + 45 * 60_000,
        }),
      },
    ]);
  }

  /**
   * Compose and deliver.
   *
   * `force` is for the preview button: it skips the once-a-day guard but not
   * the governor, so a preview is subject to the same quiet hours and DND as
   * the real thing. Otherwise the preview would be a demo of behaviour the
   * user will never actually get.
   */
  async deliver(now: Date = new Date(), force = false): Promise<Briefing | null> {
    const settings = this.inputs.getSettings();
    if (settings.paused && !force) return null;

    const day = now.toISOString().slice(0, 10);
    if (!force && this.deliveredOn === day) return null;

    const tasks = await this.inputs.listTasks();
    const briefing = composeBriefing({
      events: this.inputs.calendarEvents(),
      tasks,
      workHours: settings.workHours,
      now,
      hasCalendar: this.inputs.hasCalendar(),
    });

    // Phrase before the entrance, not during it, so the bubble is right the
    // moment Mochi arrives rather than changing under the user.
    const text = await this.phraseOrFallback(briefing, settings);

    if (!force) this.deliveredOn = day;

    if (settings.centerScreenAlerts !== false) {
      this.inputs.perform(HOLD_MS);
    }

    this.bus.emit(
      makeEvent({
        source: 'routine',
        kind: 'break',
        at: now.getTime(),
        subject: BRIEFING_SUBJECT,
        text,
        priority: 'high',
        expiresAt: now.getTime() + 45 * 60_000,
      }),
    );

    console.log(
      `[briefing] delivered: ${briefing.meetingCount} meeting(s), ${briefing.openTasks} task(s)`,
    );
    return briefing;
  }

  /**
   * Ask a model to reword the facts, falling back to the plain sentence.
   *
   * The fallback is not a degraded mode: it is correct, and it is what runs
   * with no key configured at all. The briefing is the first thing a new user
   * sees Mochi do, so it cannot depend on setup they have not done.
   */
  private async phraseOrFallback(briefing: Briefing, settings: MochiSettings): Promise<string> {
    const fallback = briefingText(briefing, settings.assistantName);

    try {
      const phrased = await Promise.race([
        this.inputs.phrase(briefingPrompt(briefing, settings.userName)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PHRASING_TIMEOUT_MS)),
      ]);

      const cleaned = phrased?.trim() ?? '';
      // A model that returns nothing, or something suspiciously long for two
      // sentences, has not done the job asked of it.
      if (cleaned.length === 0 || cleaned.length > 320) return fallback;
      return cleaned;
    } catch {
      return fallback;
    }
  }
}
