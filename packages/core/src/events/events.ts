/**
 * Typed events and the in-process bus.
 *
 * The rule this exists to enforce: **sources emit events and never address
 * the mascot**. A calendar poller, a Gmail push relay, an IMAP fallback and a
 * Pomodoro timer all look identical from here, so adding one touches nothing
 * downstream — and the cloud relay in V1.5 becomes one more Source rather
 * than a rewrite.
 *
 * Nothing here decides whether the user gets interrupted. That is the
 * governor's job, and it is the only thing allowed to make that call.
 */

/** Higher wins when two events compete for the same moment. */
export type EventPriority = 'low' | 'normal' | 'high' | 'urgent';

export const PRIORITY_RANK: Record<EventPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

export type EventSource = 'timer' | 'calendar' | 'mail' | 'tasks' | 'system' | 'routine';

/**
 * Why this event is being raised, which is what decides how much restraint
 * applies to it.
 *
 * This replaces a `userInitiated` boolean whose documentation said "a click, a
 * hotkey, launching the app" and which was then set by every scheduler in the
 * app. Because the governor allows `userInitiated` before it checks anything
 * else, that quietly meant Do Not Disturb, quiet hours, the hourly budget and
 * the minimum gap applied to almost nothing — a recurring water reminder fired
 * at 3am with Do Not Disturb on.
 *
 * A boolean could not express the difference, because there are three cases and
 * two of them looked the same:
 *
 * - `interactive` — the user just did something and is waiting. Refusing to
 *   answer is a bug, not restraint. The only true bypass, and it is safe because
 *   the user's own action is the rate limit.
 * - `scheduled` — the user set this up to happen at a time. They asked for it in
 *   general, not *now*, so "leave me alone" still applies. Exempt from the
 *   hourly budget, because rationing something specifically requested is how a
 *   reminder silently fails to arrive.
 * - `unprompted` — Mochi's own idea. Everything applies.
 */
export type EventOrigin = 'interactive' | 'scheduled' | 'unprompted';

export interface MochiEvent {
  /** Stable id, so a re-emitted event is recognised rather than duplicated. */
  readonly id: string;
  readonly source: EventSource;
  readonly kind: string;
  readonly priority: EventPriority;
  /** When the event became true (epoch ms). */
  readonly at: number;
  /**
   * Groups events describing the same underlying thing — one meeting, one
   * mail thread. Dismissing one dismisses the subject, not just the message,
   * so a re-poll cannot resurrect something the user waved away.
   */
  readonly subject: string;
  /** What Mochi would say. Templated in V1; LLM-phrased in V2. */
  readonly text: string;
  /** Why it is being raised. Defaults to `unprompted`: restraint is opt-out. */
  readonly origin: EventOrigin;
  /**
   * Whether this comes round again on its own.
   *
   * Only meaningful for `scheduled`, and it decides what quiet hours does. A
   * recurring routine is deferred out of quiet hours because missing tonight
   * costs nothing — it fires again tomorrow. A one-shot reminder gets one
   * chance, so deferring "take the pills" from 23:30 to 08:00 does not delay it,
   * it destroys it. An explicit time beats a default window.
   */
  readonly recurring?: boolean;
  /** Past this point the event is stale and is dropped rather than deferred. */
  readonly expiresAt?: number;
}

export type EventListener = (event: MochiEvent) => void;

/**
 * Minimal synchronous bus. No async, no ordering surprises: a source emits,
 * every listener sees it in registration order, done.
 */
export class EventBus {
  private readonly listeners = new Set<EventListener>();

  emit(event: MochiEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        // One bad listener must not stop the others from seeing the event.
        console.error('[bus] listener threw:', error);
      }
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Convenience for building events without repeating the boilerplate.
 *
 * `origin` defaults to `unprompted` — the most restrained option — so a new
 * source that forgets to think about it gets full governor treatment rather than
 * a silent bypass. That default is the whole reason this is not a boolean.
 */
export function makeEvent(
  input: Omit<MochiEvent, 'id' | 'priority' | 'origin'> &
    Partial<Pick<MochiEvent, 'id' | 'priority' | 'origin'>>,
): MochiEvent {
  return {
    priority: 'normal',
    origin: 'unprompted',
    id: input.id ?? `${input.source}:${input.kind}:${input.at}`,
    ...input,
  };
}
