/**
 * The interruption governor.
 *
 * This is the single decision point for "should Mochi speak right now". It is
 * the difference between a companion and Clippy, and it is deliberately
 * deterministic: no LLM is consulted, so the behaviour is cheap, predictable,
 * and testable without an API key.
 *
 * The LLM's job (V2) is to phrase a message. Whether and when it reaches the
 * user is decided here and nowhere else. There is no bypass flag, because one
 * bypass becomes ten.
 */

import type { MochiEvent } from '../events/events.js';
import { PRIORITY_RANK } from '../events/events.js';
import { parseHhMm } from '../mascot/state.js';

export interface TimeWindow {
  /** `HH:mm`, 24-hour. May span midnight. */
  readonly start: string;
  readonly end: string;
}

export interface GovernorConfig {
  /** Hard ceiling on unprompted interruptions per rolling hour. */
  readonly maxPerHour: number;
  /** Mochi stays silent inside this window. Null disables it. */
  readonly quietHours: TimeWindow | null;
  /** Explicit user toggle. Absolute — nothing unprompted gets through. */
  readonly doNotDisturb: boolean;
  /** Minimum spacing between interruptions, so they never arrive in a burst. */
  readonly minGapMs: number;
  /** Deferring further ahead than this is pointless; drop instead. */
  readonly maxDeferMs: number;
}

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  maxPerHour: 3,
  quietHours: { start: '20:00', end: '08:00' },
  doNotDisturb: false,
  minGapMs: 90_000,
  maxDeferMs: 2 * 60 * 60_000,
};

export type DecisionReason =
  | 'user-initiated'
  | 'expired'
  | 'dismissed'
  | 'duplicate'
  | 'do-not-disturb'
  | 'fullscreen'
  | 'quiet-hours'
  | 'budget-exhausted'
  | 'too-soon'
  | 'ok';

export type Decision =
  | { readonly kind: 'allow'; readonly reason: DecisionReason }
  | { readonly kind: 'defer'; readonly until: number; readonly reason: DecisionReason }
  | { readonly kind: 'drop'; readonly reason: DecisionReason };

export interface GovernorContext {
  readonly now: number;
  /**
   * A fullscreen app is in front — a game, a video, or a screen share.
   * Nothing unprompted should land on top of a presentation.
   */
  readonly fullscreenActive: boolean;
}

const HOUR_MS = 60 * 60_000;

/** Cap on remembered event ids, so dedupe memory cannot grow without bound. */
const MAX_REMEMBERED_IDS = 500;

/** Minutes since local midnight for a timestamp. */
function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

/** Whether `now` falls inside a window that may span midnight. */
export function isWithinWindow(now: number, window: TimeWindow): boolean {
  const start = parseHhMm(window.start);
  const end = parseHhMm(window.end);
  if (start === null || end === null || start === end) return false;
  const m = minutesOfDay(now);
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** Timestamp at which `now` leaves the window. Assumes it is inside one. */
export function windowEndsAt(now: number, window: TimeWindow): number {
  const end = parseHhMm(window.end);
  if (end === null) return now;

  const d = new Date(now);
  const target = new Date(d);
  target.setHours(Math.floor(end / 60), end % 60, 0, 0);
  // Quiet hours running past midnight end tomorrow.
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export class InterruptionGovernor {
  private config: GovernorConfig;
  /** Timestamps of interruptions actually shown, trimmed to the last hour. */
  private shown: number[] = [];
  private readonly dismissed = new Set<string>();
  private readonly seen = new Set<string>();

  constructor(config: GovernorConfig = DEFAULT_GOVERNOR_CONFIG) {
    this.config = config;
  }

  configure(patch: Partial<GovernorConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  get settings(): GovernorConfig {
    return this.config;
  }

  /**
   * The user waved this subject away. Never raise it again.
   *
   * Keyed on subject rather than event id so a re-poll producing a fresh id
   * for the same meeting or thread cannot resurrect it.
   */
  dismiss(subject: string): void {
    this.dismissed.add(subject);
  }

  /**
   * Let a subject speak again, because the user asked it to.
   *
   * "Never again" is the right default for something waved away, but it is
   * wrong the moment the user deliberately re-arms it — snoozing a reminder, or
   * giving a task a new time. Without this, a subject dismissed once in a
   * session is silently dropped for the rest of it, so a snooze would set a new
   * time and then never arrive: the worst kind of failure, because the user
   * asked for it explicitly and nothing reports that it was discarded.
   *
   * Only ever called for an action the user took, never to override a dismissal
   * they still mean.
   */
  undismiss(subject: string): void {
    this.dismissed.delete(subject);
  }

  isDismissed(subject: string): boolean {
    return this.dismissed.has(subject);
  }

  /** Interruptions shown in the last rolling hour. */
  countInLastHour(now: number): number {
    return this.shown.filter((t) => now - t < HOUR_MS).length;
  }

  /**
   * Decide, and record the interruption if it is allowed.
   *
   * Deciding and recording are one operation on purpose: splitting them
   * invites a caller that checks and then forgets to record, which silently
   * disables the budget.
   */
  admit(event: MochiEvent, ctx: GovernorContext): Decision {
    const decision = this.evaluate(event, ctx);
    if (decision.kind === 'allow' && event.userInitiated !== true) {
      this.shown.push(ctx.now);
      this.trim(ctx.now);
    }
    if (decision.kind === 'allow') this.remember(event.id);
    return decision;
  }

  /**
   * Bounded dedupe memory. Mochi runs for weeks; an unbounded set of every
   * event id ever shown is a slow leak. Oldest ids are forgotten first, and
   * re-showing something from thousands of events ago is not a real problem.
   */
  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > MAX_REMEMBERED_IDS) {
      const oldest = this.seen.values().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
  }

  private evaluate(event: MochiEvent, ctx: GovernorContext): Decision {
    const { now, fullscreenActive } = ctx;
    const cfg = this.config;

    // The user asked for this. Refusing to answer is a bug, not restraint.
    if (event.userInitiated === true) {
      return { kind: 'allow', reason: 'user-initiated' };
    }

    if (event.expiresAt !== undefined && event.expiresAt <= now) {
      return { kind: 'drop', reason: 'expired' };
    }

    if (this.dismissed.has(event.subject)) {
      return { kind: 'drop', reason: 'dismissed' };
    }

    if (this.seen.has(event.id)) {
      return { kind: 'drop', reason: 'duplicate' };
    }

    // Absolute. An explicit "leave me alone" is not overridable by urgency —
    // if it were, it would not mean anything.
    if (cfg.doNotDisturb) {
      return { kind: 'drop', reason: 'do-not-disturb' };
    }

    // Never land on top of a presentation or a game. Defer rather than drop:
    // they will come out of it.
    if (fullscreenActive) {
      return this.deferTo(now + 5 * 60_000, now, 'fullscreen');
    }

    const urgent = PRIORITY_RANK[event.priority] >= PRIORITY_RANK.urgent;

    // Quiet hours yield to genuinely urgent events — an 08:00 meeting alert
    // is worth hearing at 07:55 — but nothing else.
    if (!urgent && cfg.quietHours !== null && isWithinWindow(now, cfg.quietHours)) {
      return this.deferTo(windowEndsAt(now, cfg.quietHours), now, 'quiet-hours');
    }

    if (!urgent) {
      this.trim(now);

      if (this.shown.length >= cfg.maxPerHour) {
        // Wait for the oldest interruption to fall out of the rolling window.
        const oldest = this.shown[0];
        if (oldest !== undefined) {
          return this.deferTo(oldest + HOUR_MS, now, 'budget-exhausted');
        }
      }

      const last = this.shown[this.shown.length - 1];
      if (last !== undefined && now - last < cfg.minGapMs) {
        // Spacing is what stops deferred events arriving as a burst.
        return this.deferTo(last + cfg.minGapMs, now, 'too-soon');
      }
    }

    return { kind: 'allow', reason: 'ok' };
  }

  private deferTo(until: number, now: number, reason: DecisionReason): Decision {
    if (until - now > this.config.maxDeferMs) {
      // So far out it will be stale by then. Say nothing rather than
      // surfacing something the user has moved past.
      return { kind: 'drop', reason };
    }
    return { kind: 'defer', until, reason };
  }

  private trim(now: number): void {
    this.shown = this.shown.filter((t) => now - t < HOUR_MS);
  }

  /** Test and diagnostics helper. */
  reset(): void {
    this.shown = [];
    this.dismissed.clear();
    this.seen.clear();
  }
}
